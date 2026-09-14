import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { applyProviderPayment } from "../src/payments/payment-backend.js";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

function semComentarios(codigo) {
  return codigo.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/[^\n]*$/gm, "");
}

// ---------------------------------------------------------------------------
// Supabase de mentira que RESPEITA os filtros
// ---------------------------------------------------------------------------
//
// O cenario inteiro depende de filtro: a primeira leitura (pelo id da cobranca)
// precisa voltar vazia e a segunda (pelo pedido) precisa achar a linha. Um fake
// que ignora `.eq()` faria o teste passar pelo motivo errado.
function criarSupabase(pagamentos) {
  const registro = { updates: [] };

  function from(tabela) {
    const filtros = [];
    const exclusoes = [];
    let patch = null;

    function casa(linha) {
      return (
        filtros.every(([coluna, valor]) => String(linha[coluna]) === String(valor)) &&
        exclusoes.every(([coluna, valor]) => String(linha[coluna]) !== String(valor))
      );
    }

    function linhas() {
      return tabela === "payments" ? pagamentos.filter(casa) : [];
    }

    const query = {
      eq: (coluna, valor) => {
        filtros.push([coluna, valor]);
        return query;
      },
      maybeSingle: () => Promise.resolve({ data: linhas()[0] ?? null, error: null }),
      neq: (coluna, valor) => {
        exclusoes.push([coluna, valor]);
        return query;
      },
      select: () => query,
      then: (resolver, rejeitar) => {
        if (patch) {
          const alvo = linhas();

          registro.updates.push({ ids: alvo.map((linha) => linha.id), patch, tabela });
          alvo.forEach((linha) => Object.assign(linha, patch));
        }

        return Promise.resolve({ data: null, error: null }).then(resolver, rejeitar);
      },
      update: (dados) => {
        patch = dados;
        return query;
      }
    };

    return query;
  }

  return { registro, supabase: { from } };
}

const PEDIDO = "22222222-2222-4222-8222-222222222222";

// A linha do pedido ja foi sobrescrita pela cobranca MAIS NOVA (um boleto).
function linhaDoPedido(extra = {}) {
  return {
    amount_cents: 9990,
    id: "pay-1",
    order_id: PEDIDO,
    payment_method_id: "boleto",
    provider: "mercadopago",
    provider_payment_id: "boleto-222",
    status: "aguardando_pagamento",
    ...extra
  };
}

// ...e o que chega aprovado e o Pix ANTIGO, gerado antes do boleto.
function pixAntigoAprovado(extra = {}) {
  return {
    amountCents: 9990,
    expiresAt: "2026-09-12T12:00:00Z",
    externalReference: PEDIDO,
    feeCents: 99,
    paidAt: "2026-09-11T12:00:00Z",
    providerPaymentId: "pix-111",
    raw: { payment_type_id: "bank_transfer" },
    refundedCents: 0,
    settledCents: 9891,
    status: "pagamento_confirmado",
    ...extra
  };
}

function valorDoPedido(centavos) {
  return async () => ({ amountCents: centavos });
}

// ---------------------------------------------------------------------------
// O caso que perdia dinheiro
// ---------------------------------------------------------------------------

test("pagamento aprovado de cobranca substituida confirma o pedido", async () => {
  const linha = linhaDoPedido();
  const { registro, supabase } = criarSupabase([linha]);

  const resultado = await applyProviderPayment({
    providerPayment: pixAntigoAprovado(),
    resolverValorDoPedido: valorDoPedido(9990),
    supabase
  });

  assert.equal(resultado.applied, true, "o pagamento recebido nao pode ser ignorado");
  assert.equal(linha.provider_payment_id, "pix-111", "a linha aponta para a cobranca paga");
  assert.equal(linha.payment_method_id, "pix");
  assert.equal(linha.status, "pagamento_confirmado");
  assert.ok(
    registro.updates.some(
      (update) =>
        update.tabela === "orders" && update.patch.payment_status === "pagamento_confirmado"
    ),
    "o pedido tambem precisa sair de aguardando"
  );
});

// ---------------------------------------------------------------------------
// O que a reconciliacao NAO pode fazer
// ---------------------------------------------------------------------------

// Cobranca antiga pendente, cancelada ou recusada nao e dinheiro recebido.
// Deixa-la sobrescrever a atual apagaria a cobranca que o cliente ainda vai pagar.
test("cobranca antiga que nao foi paga nao sobrescreve a atual", async () => {
  for (const status of ["aguardando_pagamento", "cancelado", "recusado", "expirado"]) {
    const linha = linhaDoPedido();
    const { registro, supabase } = criarSupabase([linha]);

    const resultado = await applyProviderPayment({
      providerPayment: pixAntigoAprovado({ status }),
      resolverValorDoPedido: valorDoPedido(9990),
      supabase
    });

    assert.equal(resultado.reason, "pagamento_desconhecido", status);
    assert.equal(linha.provider_payment_id, "boleto-222", status);
    assert.deepEqual(registro.updates, [], status);
  }
});

// O cliente pagou duas cobrancas do mesmo pedido. Isso nao se resolve com
// codigo: uma precisa ser estornada, e a linha atual nao pode ser tocada.
test("pedido ja pago por outra cobranca volta como duplicidade, sem tocar na linha", async () => {
  const linha = linhaDoPedido({ provider_payment_id: "cartao-333", status: "pagamento_confirmado" });
  const { registro, supabase } = criarSupabase([linha]);

  const resultado = await applyProviderPayment({
    providerPayment: pixAntigoAprovado(),
    resolverValorDoPedido: valorDoPedido(9990),
    supabase
  });

  assert.equal(resultado.applied, false);
  assert.equal(resultado.reason, "pagamento_duplicado");
  assert.equal(resultado.orderId, PEDIDO, "sem o pedido, ninguem acha o que estornar");
  assert.equal(linha.provider_payment_id, "cartao-333");
  assert.deepEqual(registro.updates, []);
});

test("valor aprovado diferente do pedido nao confirma nada", async () => {
  const linha = linhaDoPedido();
  const { registro, supabase } = criarSupabase([linha]);

  const resultado = await applyProviderPayment({
    providerPayment: pixAntigoAprovado(),
    resolverValorDoPedido: valorDoPedido(12000),
    supabase
  });

  assert.equal(resultado.reason, "valor_divergente");
  assert.equal(linha.status, "aguardando_pagamento");
  assert.deepEqual(registro.updates, []);
});

// Webhook compartilhado: evento de outro ambiente chega assinado e valido aqui.
test("referencia que nao e pedido desta loja continua desconhecida", async () => {
  for (const externalReference of [null, "", "pedido-sem-formato"]) {
    const { registro, supabase } = criarSupabase([linhaDoPedido()]);

    const resultado = await applyProviderPayment({
      providerPayment: pixAntigoAprovado({ externalReference }),
      resolverValorDoPedido: valorDoPedido(9990),
      supabase
    });

    assert.equal(resultado.reason, "pagamento_desconhecido", String(externalReference));
    assert.deepEqual(registro.updates, []);
  }

  const { supabase } = criarSupabase([]);
  const resultado = await applyProviderPayment({
    providerPayment: pixAntigoAprovado(),
    resolverValorDoPedido: valorDoPedido(9990),
    supabase
  });

  assert.equal(resultado.reason, "pagamento_desconhecido");
});

// A reconciliacao e o caminho de excecao. A cobranca atual continua sendo
// achada pelo proprio id, sem nenhuma leitura extra do pedido.
test("a cobranca atual continua sendo achada pelo proprio id", async () => {
  const { supabase } = criarSupabase([linhaDoPedido({ provider_payment_id: "pix-111" })]);

  const resultado = await applyProviderPayment({
    providerPayment: pixAntigoAprovado(),
    resolverValorDoPedido: async () => {
      throw new Error("a cobranca atual nao deveria passar pela reconciliacao");
    },
    supabase
  });

  assert.equal(resultado.applied, true);
});

// ---------------------------------------------------------------------------
// O webhook guarda o motivo
// ---------------------------------------------------------------------------

test("dinheiro nao aplicado deixa o motivo no evento do webhook", async () => {
  const rota = semComentarios(await source("app/api/pagamento/webhook/route.js"));

  assert.match(rota, /REQUER_PESSOA = new Set\(\["pagamento_duplicado", "valor_divergente"\]\)/);
  assert.match(rota, /error: REQUER_PESSOA\.has\(result\.reason\) \? result\.reason : undefined/);
});
