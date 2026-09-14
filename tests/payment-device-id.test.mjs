import assert from "node:assert/strict";
import test from "node:test";

// A primeira cobranca real em producao, em 2026-09-14, voltou 400:
// "The name of the following parameters is wrong : [device_id]". A loja mandava
// o Device ID no CORPO da cobranca, e a API de pagamentos so aceita esse dado no
// cabecalho `X-meli-session-id`.
//
// O staging nao pegou porque os testes de ponta a ponta mandavam o id vazio, e
// um campo vazio nem entrava na requisicao. Num navegador real o script de
// seguranca sempre gera o id. Estes testes usam um id preenchido de proposito.
const ID_DO_NAVEGADOR = "armor.3f9c2a7b1e:checkout-9";

async function cobrarCartao(deviceId) {
  process.env.SUPABASE_RUNTIME_TARGET = "production";
  process.env.MERCADOPAGO_ACCESS_TOKEN = "credencial-de-mentira";

  const { createCardPayment } = await import("../src/payments/mercadopago.js");
  const fetchOriginal = globalThis.fetch;
  const chamadas = [];

  globalThis.fetch = async (url, init) => {
    chamadas.push({ corpo: JSON.parse(init.body), headers: init.headers, url });

    return new Response(JSON.stringify({ id: 123, status: "approved", transaction_amount: 94.9 }), {
      headers: { "content-type": "application/json" },
      status: 201
    });
  };

  try {
    const pagamento = await createCardPayment({
      amountCents: 9490,
      cardToken: "token-de-mentira",
      deviceId,
      paymentMethodId: "master"
    });

    return { chamadas, pagamento };
  } finally {
    globalThis.fetch = fetchOriginal;
  }
}

test("o Device ID vai no cabecalho X-meli-session-id", async () => {
  const { chamadas, pagamento } = await cobrarCartao(ID_DO_NAVEGADOR);

  assert.equal(chamadas.length, 1);
  assert.equal(chamadas[0].headers["X-meli-session-id"], ID_DO_NAVEGADOR);
  assert.equal(pagamento.status, "pagamento_confirmado");
});

test("o corpo da cobranca nao leva device_id", async () => {
  const { chamadas } = await cobrarCartao(ID_DO_NAVEGADOR);

  assert.equal("device_id" in chamadas[0].corpo, false, "a API recusa a cobranca inteira");
});

test("sem Device ID nao sai cabecalho vazio", async () => {
  const { chamadas } = await cobrarCartao("");

  assert.equal("X-meli-session-id" in chamadas[0].headers, false);
});

// O id vem do navegador do cliente. Um cabecalho com quebra de linha faz o
// fetch lancar, e a cobranca viraria "provedor indisponivel". Valor fora do
// formato e descartado e a cobranca segue sem ele.
test("Device ID fora do formato e descartado e a cobranca segue", async () => {
  const { chamadas, pagamento } = await cobrarCartao("armor.1\r\nX-Injetado: sim");

  assert.equal(chamadas.length, 1, "a cobranca precisa acontecer mesmo sem o id");
  assert.equal("X-meli-session-id" in chamadas[0].headers, false);
  assert.equal(pagamento.status, "pagamento_confirmado");
});
