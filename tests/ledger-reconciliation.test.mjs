import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { resolveOrderCostCents } from "../src/admin/order-analytics.js";
import { recomputeLedger, resolveActualCostCents } from "../src/payments/ledger-reconciliation.js";

// ---------------------------------------------------------------------------
// Supabase de mentira
// ---------------------------------------------------------------------------
//
// Reproduz so o encadeamento que o modulo usa: o builder e "thenable", entao
// tanto `await query` quanto `await query.maybeSingle()` funcionam.
function criarSupabase(tabelas, registro = { updates: [] }) {
  function builder(tabela) {
    const query = {
      eq: () => query,
      limit: () => query,
      maybeSingle: () => Promise.resolve(resposta(tabela, true)),
      order: () => query,
      select: () => query,
      then: (resolve, reject) => Promise.resolve(resposta(tabela, false)).then(resolve, reject),
      update: (patch) => {
        registro.updates.push({ patch, tabela });
        return query;
      }
    };

    return query;
  }

  function resposta(tabela, single) {
    const conteudo = tabelas[tabela];

    if (conteudo instanceof Error) {
      return { data: null, error: { message: conteudo.message } };
    }

    const linhas = conteudo ?? [];

    return { data: single ? (linhas[0] ?? null) : linhas, error: null };
  }

  return { from: builder, registro };
}

const PEDIDO = "11111111-1111-1111-1111-111111111111";

function cenario({ itens = [], ledger, pagamentos = [], compras = [] }) {
  const registro = { updates: [] };
  const supabase = criarSupabase(
    {
      order_items: itens,
      order_ledger: ledger === undefined ? [] : [ledger],
      payments: pagamentos,
      supplier_purchases: compras
    },
    registro
  );

  return { registro, supabase };
}

const LEDGER = { id: "led-1", order_id: PEDIDO, payment_id: null, payout_status: "pendente" };
const PAGAMENTO = {
  amount_cents: 30000,
  id: "pay-1",
  provider_fee_cents: 1500,
  refunded_amount_cents: 0,
  settled_amount_cents: 28500,
  status: "pagamento_confirmado"
};

// ---------------------------------------------------------------------------
// Custo real
// ---------------------------------------------------------------------------

// Zero e um custo real possivel (brinde, frete gratis). So a AUSENCIA de linha
// com valor significa desconhecido — por isso null e nao 0.
test("sem compra registrada o custo real e desconhecido, nao zero", () => {
  assert.equal(resolveActualCostCents([]), null);
  assert.equal(
    resolveActualCostCents([{ product_cost_cents: null, shipping_cost_cents: null }]),
    null
  );
  assert.equal(resolveActualCostCents([{ product_cost_cents: 0, shipping_cost_cents: null }]), 0);
});

test("o custo real soma produto e frete de todas as compras", () => {
  assert.equal(
    resolveActualCostCents([
      { product_cost_cents: 10000, shipping_cost_cents: 2500 },
      { product_cost_cents: 500, shipping_cost_cents: null }
    ]),
    13000
  );
});

// A regra de custo e UMA no projeto: painel e ledger nao podem discordar.
test("a regra de custo prefere o real e cai no estimado", () => {
  assert.equal(resolveOrderCostCents({ actualCostCents: 12500, estimatedCostCents: 9000 }), 12500);
  assert.equal(resolveOrderCostCents({ actualCostCents: null, estimatedCostCents: 9000 }), 9000);
  assert.equal(resolveOrderCostCents({ actualCostCents: 0, estimatedCostCents: 9000 }), 0);
});

// ---------------------------------------------------------------------------
// Recomputo
// ---------------------------------------------------------------------------

test("com custo real a margem reconciliada sai do liquido menos o custo", async () => {
  const { registro, supabase } = cenario({
    compras: [{ product_cost_cents: 12000, shipping_cost_cents: 500 }],
    itens: [{ subtotal_cost_cents: 9000 }],
    ledger: LEDGER,
    pagamentos: [PAGAMENTO]
  });

  const resultado = await recomputeLedger({ orderId: PEDIDO, supabase });

  assert.equal(resultado.motivo, "reconciliado");
  assert.equal(resultado.reconciledMarginCents, 28500 - 12500);
  assert.equal(resultado.provisionalMarginCents, 28500 - 9000);

  const [{ patch }] = registro.updates;
  assert.equal(patch.actual_cost_cents, 12500);
  assert.ok(patch.reconciled_at, "reconciled_at deveria ser preenchido");
});

// O provedor cobra a taxa ANTES de informar o liquido. Descontar de novo
// inventaria um prejuizo que nao existe.
test("a taxa nao e descontada duas vezes quando o liquido veio", async () => {
  const { supabase } = cenario({
    compras: [{ product_cost_cents: 0, shipping_cost_cents: 0 }],
    ledger: LEDGER,
    pagamentos: [PAGAMENTO]
  });

  const resultado = await recomputeLedger({ orderId: PEDIDO, supabase });

  assert.equal(resultado.receivedCents, 28500);
});

// settled_amount_cents == 0 significa "o provedor ainda nao informou".
test("liquidado zero cai para cobrado menos taxa", async () => {
  const { supabase } = cenario({
    compras: [{ product_cost_cents: 10000, shipping_cost_cents: 0 }],
    ledger: LEDGER,
    pagamentos: [{ ...PAGAMENTO, settled_amount_cents: 0 }]
  });

  const resultado = await recomputeLedger({ orderId: PEDIDO, supabase });

  assert.equal(resultado.receivedCents, 30000 - 1500);
  assert.equal(resultado.reconciledMarginCents, 28500 - 10000);
});

// Prejuizo tem que poder ser gravado: e exatamente o caso que precisa aparecer
// no painel antes de alguem repassar qualquer valor.
test("margem negativa e gravada, nao zerada", async () => {
  const { registro, supabase } = cenario({
    compras: [{ product_cost_cents: 40000, shipping_cost_cents: 0 }],
    itens: [{ subtotal_cost_cents: 9000 }],
    ledger: LEDGER,
    pagamentos: [PAGAMENTO]
  });

  const resultado = await recomputeLedger({ orderId: PEDIDO, supabase });

  assert.equal(resultado.reconciledMarginCents, 28500 - 40000);
  assert.equal(registro.updates[0].patch.reconciled_margin_cents, -11500);
});

test("sem custo real a margem reconciliada continua nula", async () => {
  const { registro, supabase } = cenario({
    itens: [{ subtotal_cost_cents: 9000 }],
    ledger: LEDGER,
    pagamentos: [PAGAMENTO]
  });

  const resultado = await recomputeLedger({ orderId: PEDIDO, supabase });

  assert.equal(resultado.motivo, "sem_custo_real");
  assert.equal(resultado.reconciledMarginCents, null);
  assert.equal(registro.updates[0].patch.reconciled_at, null);
});

// Rodar duas vezes tem que dar o mesmo resultado: e o que permite chamar a
// reconciliacao fora da transacao do admin sem risco de dessincronizar.
test("recomputar duas vezes da o mesmo resultado", async () => {
  const entrada = {
    compras: [{ product_cost_cents: 12000, shipping_cost_cents: 500 }],
    itens: [{ subtotal_cost_cents: 9000 }],
    ledger: LEDGER,
    pagamentos: [PAGAMENTO]
  };

  const primeiro = await recomputeLedger({ orderId: PEDIDO, supabase: cenario(entrada).supabase });
  const segundo = await recomputeLedger({ orderId: PEDIDO, supabase: cenario(entrada).supabase });

  assert.deepEqual({ ...primeiro }, { ...segundo });
});

// ---------------------------------------------------------------------------
// Limites
// ---------------------------------------------------------------------------

// Um ledger estornado registra que o dinheiro voltou. Recomputar por cima
// ressuscitaria a margem de uma venda que nao existe mais.
test("ledger estornado nao e recomputado", async () => {
  const { registro, supabase } = cenario({
    ledger: { ...LEDGER, payout_status: "estornado" },
    pagamentos: [PAGAMENTO]
  });

  const resultado = await recomputeLedger({ orderId: PEDIDO, supabase });

  assert.equal(resultado.motivo, "estornado");
  assert.equal(registro.updates.length, 0);
});

test("pedido sem ledger nao e erro", async () => {
  const { registro, supabase } = cenario({ ledger: undefined });

  const resultado = await recomputeLedger({ orderId: PEDIDO, supabase });

  assert.deepEqual(resultado, { motivo: "sem_ledger", ok: true });
  assert.equal(registro.updates.length, 0);
});

test("sem pagamento confirmado nada e gravado", async () => {
  const { registro, supabase } = cenario({ ledger: LEDGER, pagamentos: [] });

  const resultado = await recomputeLedger({ orderId: PEDIDO, supabase });

  assert.equal(resultado.motivo, "sem_pagamento_confirmado");
  assert.equal(registro.updates.length, 0);
});

test("sem id de pedido a funcao recusa em vez de consultar", async () => {
  const { registro, supabase } = cenario({ ledger: LEDGER });

  const resultado = await recomputeLedger({ orderId: null, supabase });

  assert.deepEqual(resultado, { motivo: "sem_pedido", ok: false });
  assert.equal(registro.updates.length, 0);
});

// ---------------------------------------------------------------------------
// Gatilho
// ---------------------------------------------------------------------------

// O ledger e derivado e sempre recomputavel. Travar a gravacao do admin por
// causa dele seria pior do que recomputar na proxima operacao.
test("a reconciliacao nao derruba a operacao do admin", async () => {
  const codigo = await readFile(
    new URL("../src/admin/order-operation.js", import.meta.url),
    "utf8"
  );
  const bloco = codigo.slice(codigo.indexOf("recomputeLedger"));

  assert.match(codigo, /try \{\s*await recomputeLedger/);
  assert.match(bloco, /catch \(error\)/);
  assert.match(bloco, /ledger_reconciliacao_pos_operacao_falhou/);
});
