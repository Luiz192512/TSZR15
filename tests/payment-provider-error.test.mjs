import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { redactSensitive } from "../src/lib/logger.js";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

function semComentarios(codigo) {
  return codigo.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/[^\n]*$/gm, "");
}

// Resposta real do provedor, copiada de uma chamada de sandbox em 2026-09-11.
// A loja tinha mandado um e-mail de pagador em dominio reservado (example.com),
// e a conta recusou o meio de pagamento por regra. Na tela o cliente via
// "Nao foi possivel processar o pagamento", e o log guardava so "HTTP 400":
// descobrir o motivo exigiu refazer a chamada fora da loja.
const RECUSA_POR_REGRA = {
  cause: [
    {
      code: 10113,
      data: "11-09-2026T19:03:14UTC;284af242-952e-42d3-b7e1-28cb8fa4a9c8",
      description: "The Payment Method is excluded by a rule."
    }
  ],
  error: "bad_request",
  message: "excludes_by_rule",
  status: 400
};

async function cobrarComRespostaDoProvedor(corpo, status) {
  process.env.SUPABASE_RUNTIME_TARGET = "production";
  process.env.MERCADOPAGO_ACCESS_TOKEN = "credencial-de-mentira";

  const { createCardPayment } = await import("../src/payments/mercadopago.js");
  const fetchOriginal = globalThis.fetch;

  globalThis.fetch = async () =>
    new Response(JSON.stringify(corpo), {
      headers: { "content-type": "application/json" },
      status
    });

  try {
    await createCardPayment({
      amountCents: 9990,
      cardToken: "token-de-mentira",
      paymentMethodId: "master"
    });

    return null;
  } catch (error) {
    return error;
  } finally {
    globalThis.fetch = fetchOriginal;
  }
}

test("a recusa do provedor chega com motivo, codigo e rastreio", async () => {
  const erro = await cobrarComRespostaDoProvedor(RECUSA_POR_REGRA, 400);

  assert.ok(erro, "a cobranca recusada precisa falhar");
  assert.equal(erro.status, 400);
  assert.equal(erro.retryable, false, "4xx e dado invalido, nao indisponibilidade");
  assert.equal(erro.motivoProvedor, "excludes_by_rule");
  assert.equal(erro.causasProvedor.length, 1);
  assert.equal(erro.causasProvedor[0].codigo, 10113);
  assert.match(erro.causasProvedor[0].descricao, /excluded by a rule/);
  // O suporte do provedor pede este identificador para achar a requisicao.
  assert.match(erro.causasProvedor[0].rastreio, /284af242/);
});

test("erro do provedor sem causa nao inventa campo", async () => {
  const erro = await cobrarComRespostaDoProvedor({ message: "internal_error" }, 500);

  assert.equal(erro.retryable, true, "5xx e indisponibilidade: vale retentar");
  assert.equal(erro.motivoProvedor, "internal_error");
  assert.deepEqual(erro.causasProvedor, []);
});

// A armadilha que fez o motivo se perder antes: `redactSensitive` apaga toda
// chave que contenha "message", "payload" ou "url". Um campo chamado
// `providerMessage` seria gravado como [redacted], e ninguem perceberia.
test("o log preserva o motivo do provedor e apagaria um campo chamado message", () => {
  const registro = redactSensitive({
    causasProvedor: [{ codigo: 10113, descricao: "The Payment Method is excluded by a rule." }],
    motivoProvedor: "excludes_by_rule",
    providerMessage: "excludes_by_rule"
  });

  assert.equal(registro.motivoProvedor, "excludes_by_rule");
  assert.equal(registro.causasProvedor[0].codigo, 10113);
  assert.match(registro.causasProvedor[0].descricao, /excluded by a rule/);
  assert.equal(registro.providerMessage, "[redacted]");
});

test("as tres rotas de cobranca registram o motivo do provedor", async () => {
  for (const metodo of ["pix", "cartao", "boleto"]) {
    const rota = semComentarios(await source(`app/api/pagamento/${metodo}/route.js`));
    const bloco = rota.slice(rota.indexOf('"payment_provider_failed"'));

    assert.match(bloco, /motivoProvedor: error\.motivoProvedor/, metodo);
    assert.match(bloco, /causasProvedor: error\.causasProvedor/, metodo);
  }
});

// O evento do webhook e o unico lugar onde a falha fica GRAVADA. Sem o codigo
// da causa, quem investiga depois so encontra a mensagem generica.
test("o webhook guarda o codigo da causa no evento", async () => {
  const rota = semComentarios(await source("app/api/pagamento/webhook/route.js"));

  assert.match(rota, /causasProvedor/);
  assert.match(rota, /\.map\(\(causa\) => causa\.codigo\)/);
});
