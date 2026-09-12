import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { isPaymentLinkExpired, PAYMENT_LINK_TTL_DAYS } from "../src/payments/payment-link.js";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

const AGORA = Date.parse("2026-09-10T12:00:00Z");
const DIA_MS = 24 * 60 * 60 * 1000;

function pedido({ dias, status = "aguardando_pagamento" }) {
  return {
    created_at: new Date(AGORA - dias * DIA_MS).toISOString(),
    payment_status: status
  };
}

// ---------------------------------------------------------------------------
// A janela
// ---------------------------------------------------------------------------

test("link novo vale", () => {
  assert.equal(isPaymentLinkExpired(pedido({ dias: 0 }), { now: AGORA }), false);
  assert.equal(isPaymentLinkExpired(pedido({ dias: 6 }), { now: AGORA }), false);
});

test("link velho vence", () => {
  assert.equal(isPaymentLinkExpired(pedido({ dias: 8 }), { now: AGORA }), true);
  assert.equal(isPaymentLinkExpired(pedido({ dias: 400 }), { now: AGORA }), true);
});

// O boleto leva ate 3 dias uteis para compensar. Uma janela curta transformaria
// compra legitima em suporte.
test("a janela cobre a compensacao do boleto com folga", () => {
  assert.ok(PAYMENT_LINK_TTL_DAYS >= 7, "menos de 7 dias nao cobre boleto");
  assert.equal(isPaymentLinkExpired(pedido({ dias: 5 }), { now: AGORA }), false);
});

// ---------------------------------------------------------------------------
// Quem nao vence
// ---------------------------------------------------------------------------

// Quem pagou tem direito de voltar e ver a confirmacao, e ali nao ha mais
// cobranca a criar.
test("pedido pago nunca vence", () => {
  const pago = pedido({ dias: 400, status: "pagamento_confirmado" });

  assert.equal(isPaymentLinkExpired(pago, { now: AGORA }), false);
});

// `created_at` e NOT NULL DEFAULT now(): isto nao acontece com dado integro. Se
// acontecer, recusar a cobranca de um pedido legitimo custa mais do que manter
// um link a mais no ar.
test("sem data de criacao o link continua valendo", () => {
  assert.equal(isPaymentLinkExpired({ created_at: null }, { now: AGORA }), false);
  assert.equal(isPaymentLinkExpired({ created_at: "nao-e-data" }, { now: AGORA }), false);
  assert.equal(isPaymentLinkExpired(null, { now: AGORA }), false);
});

// ---------------------------------------------------------------------------
// Onde a regra e aplicada
// ---------------------------------------------------------------------------

// A guarda que importa e a da cobranca, nao a da tela: e ali que o dinheiro se
// move, e a rota pode ser chamada direto, sem passar pela pagina.
test("a rota de cobranca recusa link vencido antes de cobrar", async () => {
  const fluxo = await source("src/payments/charge-flow.js");
  const bloco = fluxo.slice(
    fluxo.indexOf("export async function loadChargeableOrder"),
    fluxo.indexOf("export async function persistProviderCharge")
  );

  assert.match(bloco, /isPaymentLinkExpired\(order\)/);
  assert.match(bloco, /status: 410/);
});

test("o pedido lido para cobranca inclui a data de criacao", async () => {
  const backend = await source("src/payments/payment-backend.js");
  const select = backend.match(/from\("orders"\)\s*\.select\(\s*"([^"]*)"/)?.[1] ?? "";

  assert.ok(select.includes("created_at"), "sem created_at a expiracao nao tem como ser avaliada");
});

// Link vencido nao e "pagina nao encontrada": o pedido existe. Um 404 mudo
// deixaria o cliente achando que perdeu a compra.
test("a pagina mostra o pedido e um caminho, nao um 404", async () => {
  const pagina = await source("app/pedido/pagamento/[orderId]/page.js");
  const bloco = pagina.slice(pagina.indexOf("isPaymentLinkExpired(order)"));

  assert.match(bloco, /Este link de pagamento venceu/);
  assert.match(bloco, /order\.order_number/);
  assert.match(bloco, /wa\.me/);
  assert.equal(bloco.slice(0, bloco.indexOf("return (\n    <main")).includes("notFound"), false);
});
