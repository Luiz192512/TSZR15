import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  isSettledPaymentStatus,
  paymentStatuses,
  pendingPaymentStatuses
} from "../src/orders/status.js";
import { isStatusRegression, statusRank } from "../src/payments/payment-backend.js";
import { normalizeProviderPayment } from "../src/payments/mercadopago.js";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

// ---------------------------------------------------------------------------
// Estados
// ---------------------------------------------------------------------------

// Remover qualquer um destes invalidaria pedidos ja gravados no banco.
test("os quatro status do fluxo manual continuam existindo", () => {
  const ids = paymentStatuses.map((status) => status.id);

  for (const antigo of [
    "aguardando_pagamento",
    "pagamento_confirmado",
    "cancelado",
    "reembolsado"
  ]) {
    assert.ok(ids.includes(antigo), `status historico removido: ${antigo}`);
  }
});

test("os estados de cartao e boleto entraram na lista", () => {
  const ids = paymentStatuses.map((status) => status.id);

  for (const novo of [
    "em_analise",
    "autorizado",
    "recusado",
    "expirado",
    "reembolsado_parcial",
    "estornado"
  ]) {
    assert.ok(ids.includes(novo), `status novo ausente: ${novo}`);
  }
});

// A lista da aplicacao e o CHECK do banco precisam aceitar o mesmo conjunto,
// senao gravar um status valido no codigo estoura no Postgres.
test("todo status da aplicacao e aceito pelo CHECK da migracao", async () => {
  const sql = await source("supabase/migrations/20260825120000_payment_ledger_and_webhooks.sql");
  const check = sql.slice(sql.indexOf("payments_status_check"));

  for (const status of paymentStatuses) {
    assert.match(check, new RegExp(`'${status.id}'`), `CHECK nao aceita: ${status.id}`);
  }
});

// Cartao autorizado e dinheiro RESERVADO, nao recebido. Tratar como pago
// mandaria comprar no fornecedor antes de a loja ter o dinheiro.
test("autorizado nao conta como pagamento liquidado", () => {
  assert.equal(isSettledPaymentStatus("autorizado"), false);
  assert.ok(pendingPaymentStatuses.includes("autorizado"));

  assert.equal(isSettledPaymentStatus("pagamento_confirmado"), true);
  assert.equal(pendingPaymentStatuses.includes("pagamento_confirmado"), false);
});

test("boleto em aberto e analise antifraude ficam pendentes", () => {
  assert.ok(pendingPaymentStatuses.includes("aguardando_pagamento"));
  assert.ok(pendingPaymentStatuses.includes("em_analise"));
  assert.ok(pendingPaymentStatuses.includes("expirado"));
});

// Chargeback chega depois da confirmacao e precisa AVANCAR o estado; a
// confirmacao reenviada depois do chargeback nao pode voltar atras.
test("chargeback avanca e nao pode ser desfeito por evento atrasado", () => {
  assert.equal(isStatusRegression("pagamento_confirmado", "estornado"), false);
  assert.equal(isStatusRegression("estornado", "pagamento_confirmado"), true);
  assert.ok(statusRank("estornado") > statusRank("reembolsado"));
});

test("recusado nao avanca por cima de um pagamento confirmado", () => {
  assert.equal(isStatusRegression("pagamento_confirmado", "recusado"), true);
});

// ---------------------------------------------------------------------------
// Normalizacao de cartao e boleto
// ---------------------------------------------------------------------------

test("autorizado sem captura vira status proprio", () => {
  const normalizado = normalizeProviderPayment({
    id: 7,
    status: "authorized",
    status_detail: "pending_capture",
    transaction_amount: 100
  });

  assert.equal(normalizado.status, "autorizado");
  assert.equal(normalizado.statusDetail, "pending_capture");
});

test("analise antifraude e chargeback tem status proprios", () => {
  assert.equal(normalizeProviderPayment({ status: "in_process" }).status, "em_analise");
  assert.equal(normalizeProviderPayment({ status: "in_mediation" }).status, "em_analise");
  assert.equal(normalizeProviderPayment({ status: "charged_back" }).status, "estornado");
  assert.equal(normalizeProviderPayment({ status: "rejected" }).status, "recusado");
});

test("boleto traz linha digitavel e vencimento", () => {
  const normalizado = normalizeProviderPayment({
    barcode: { content: "23793381286" },
    date_of_expiration: "2026-09-01T23:59:59Z",
    id: 9,
    point_of_interaction: { transaction_data: { ticket_url: "https://boleto" } },
    status: "pending",
    transaction_amount: 150
  });

  assert.equal(normalizado.barcode, "23793381286");
  assert.equal(normalizado.expiresAt, "2026-09-01T23:59:59Z");
  assert.equal(normalizado.status, "aguardando_pagamento");
  assert.equal(normalizado.ticketUrl, "https://boleto");
});

// ---------------------------------------------------------------------------
// Dado de cartao nao toca o servidor
// ---------------------------------------------------------------------------

test("a rota de cartao aceita token e nada de numero, CVV ou validade", async () => {
  const rota = await source("app/api/pagamento/cartao/route.js");

  assert.match(rota, /body\?\.cardToken/);

  for (const proibido of [
    "cardNumber",
    "card_number",
    "securityCode",
    "security_code",
    "cvv",
    "expirationMonth",
    "expiration_month"
  ]) {
    assert.equal(rota.includes(proibido), false, `a rota nao pode conhecer o campo ${proibido}`);
  }
});

test("o cliente do provedor nao envia campo cru de cartao", async () => {
  const cliente = await source("src/payments/mercadopago.js");
  const trecho = cliente.slice(cliente.indexOf("createCardPayment"));

  assert.match(trecho, /token: cardToken/);
  assert.equal(trecho.includes("card_number"), false);
  assert.equal(trecho.includes("security_code"), false);
});

// A recusa detalhada ("sem limite", "cartao roubado") e informacao da conta do
// titular: fica no log, nao na tela de quem esta com o cartao na mao.
test("o detalhe da recusa nao vai para a resposta do cliente", async () => {
  const rota = await source("app/api/pagamento/cartao/route.js");
  const resposta = rota.slice(rota.indexOf("return Response.json("), rota.indexOf("} catch"));

  assert.equal(resposta.includes("statusDetail"), false);
  assert.match(rota, /logServerEvent[\s\S]*statusDetail/);
});

// ---------------------------------------------------------------------------
// Preambulo compartilhado
// ---------------------------------------------------------------------------

// Regra de seguranca repetida em tres rotas vira regra que falta em uma delas.
test("as tres formas de pagamento passam pelo mesmo preambulo", async () => {
  for (const rota of ["pix", "cartao", "boleto"]) {
    const conteudo = await source(`app/api/pagamento/${rota}/route.js`);

    assert.match(conteudo, /openChargeRequest\(request\)/, `${rota} sem preambulo comum`);
    assert.match(conteudo, /loadChargeableOrder\(orderId, supabase\)/, `${rota} sem recalculo`);
  }

  const fluxo = await source("src/payments/charge-flow.js");

  assert.match(fluxo, /isOnlinePaymentEnabled\(\)/);
  assert.match(fluxo, /isSameOriginRequest\(request\)/);
  assert.match(fluxo, /rateLimitProfiles\.paymentCharge/);
  assert.match(fluxo, /resolveOrderChargeCents/);
});

test("pedido ja pago nao gera nova cobranca em nenhuma forma", async () => {
  const fluxo = await source("src/payments/charge-flow.js");

  assert.match(fluxo, /payment_status === "pagamento_confirmado"/);
  assert.match(fluxo, /Pedido ja esta pago/);
});
