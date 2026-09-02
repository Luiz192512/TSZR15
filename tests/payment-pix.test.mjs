import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import {
  buildSignatureManifest,
  parseSignatureHeader,
  verifyWebhookSignature
} from "../src/payments/mercadopago-signature.js";
import {
  isStatusRegression,
  recordWebhookEvent,
  resolveSettledCents,
  statusRank
} from "../src/payments/payment-backend.js";
import { mapProviderStatus, normalizeProviderPayment } from "../src/payments/mercadopago.js";

const SECRET = "segredo-de-teste";

function assinar({ dataId, requestId, timestamp }) {
  return createHmac("sha256", SECRET)
    .update(buildSignatureManifest({ dataId, requestId, timestamp }))
    .digest("hex");
}

// ---------------------------------------------------------------------------
// Assinatura
// ---------------------------------------------------------------------------

test("cabecalho x-signature e lido em ts e v1", () => {
  const parsed = parseSignatureHeader("ts=1700000000, v1=abc123");

  assert.equal(parsed.timestamp, "1700000000");
  assert.equal(parsed.signature, "abc123");
});

test("assinatura correta e aceita", async () => {
  const timestamp = "1700000000";
  const resultado = await verifyWebhookSignature({
    dataId: "123",
    nowSeconds: Number(timestamp),
    requestId: "req-1",
    secret: SECRET,
    signatureHeader: `ts=${timestamp},v1=${assinar({ dataId: "123", requestId: "req-1", timestamp })}`
  });

  assert.equal(resultado.valid, true);
});

test("assinatura de outro pagamento e recusada", async () => {
  const timestamp = "1700000000";
  const resultado = await verifyWebhookSignature({
    // Assinatura gerada para o pagamento 123, apresentada para o 999.
    dataId: "999",
    nowSeconds: Number(timestamp),
    requestId: "req-1",
    secret: SECRET,
    signatureHeader: `ts=${timestamp},v1=${assinar({ dataId: "123", requestId: "req-1", timestamp })}`
  });

  assert.equal(resultado.valid, false);
  assert.match(resultado.reason, /nao confere/);
});

// Assinatura valida capturada ontem nao pode confirmar pagamento hoje.
test("assinatura fora da janela de tempo e recusada", async () => {
  const timestamp = "1700000000";
  const resultado = await verifyWebhookSignature({
    dataId: "123",
    nowSeconds: Number(timestamp) + 3600,
    requestId: "req-1",
    secret: SECRET,
    signatureHeader: `ts=${timestamp},v1=${assinar({ dataId: "123", requestId: "req-1", timestamp })}`
  });

  assert.equal(resultado.valid, false);
  assert.match(resultado.reason, /janela/);
});

test("sem segredo configurado nada e aceito", async () => {
  const resultado = await verifyWebhookSignature({
    dataId: "123",
    requestId: "req-1",
    secret: "",
    signatureHeader: "ts=1,v1=qualquer"
  });

  assert.equal(resultado.valid, false);
});

// ---------------------------------------------------------------------------
// Ordem dos eventos
// ---------------------------------------------------------------------------

test("evento fora de ordem nao reabre pedido encerrado", () => {
  // "aprovado" chegando depois de "reembolsado" nao pode voltar o pedido.
  assert.equal(isStatusRegression("reembolsado", "pagamento_confirmado"), true);
  assert.equal(isStatusRegression("estornado", "pagamento_confirmado"), true);

  // Avanco legitimo continua passando.
  assert.equal(isStatusRegression("aguardando_pagamento", "pagamento_confirmado"), false);
  assert.equal(isStatusRegression("pagamento_confirmado", "reembolsado"), false);
});

test("status desconhecido nao vira confirmacao", () => {
  assert.equal(mapProviderStatus("algo_novo_do_provedor"), "em_analise");
  assert.equal(mapProviderStatus(undefined), "em_analise");
  assert.equal(mapProviderStatus("approved"), "pagamento_confirmado");
  assert.equal(mapProviderStatus("rejected"), "recusado");
});

test("a escala de status cobre todos os estados usados", () => {
  for (const status of [
    "aguardando_pagamento",
    "em_analise",
    "autorizado",
    "pagamento_confirmado",
    "reembolsado",
    "estornado",
    "recusado",
    "cancelado",
    "expirado"
  ]) {
    assert.ok(statusRank(status) >= 0, `status sem posicao na escala: ${status}`);
  }
});

// ---------------------------------------------------------------------------
// Normalizacao do retorno do provedor
// ---------------------------------------------------------------------------

test("valor liquidado e taxa sao extraidos em centavos", () => {
  const normalizado = normalizeProviderPayment({
    date_approved: "2026-08-25T12:00:00Z",
    fee_details: [{ amount: 2.97 }],
    id: 123456,
    point_of_interaction: { transaction_data: { qr_code: "000201..." } },
    status: "approved",
    transaction_amount: 300,
    transaction_details: { net_received_amount: 297.03 }
  });

  assert.equal(normalizado.amountCents, 30000);
  assert.equal(normalizado.settledCents, 29703);
  assert.equal(normalizado.feeCents, 297);
  assert.equal(normalizado.status, "pagamento_confirmado");
  assert.equal(normalizado.providerPaymentId, "123456");
});

// A janela entre confirmar e liquidar existe: liquidado ausente nao pode virar
// zero, senao a margem provisoria fica igual ao custo negativo.
test("liquidado ausente vira nulo, nao zero", () => {
  const normalizado = normalizeProviderPayment({
    id: 1,
    status: "approved",
    transaction_amount: 300
  });

  assert.equal(normalizado.settledCents, null);
  assert.equal(normalizado.feeCents, 0);
});

// ---------------------------------------------------------------------------
// Idempotencia e reentrada
// ---------------------------------------------------------------------------

function supabaseFake({ existing = null, insertError = null } = {}) {
  return {
    from() {
      return {
        eq() {
          return this;
        },
        insert() {
          return {
            maybeSingle: async () => ({ data: null, error: insertError }),
            select() {
              return this;
            }
          };
        },
        maybeSingle: async () => ({ data: existing, error: null }),
        select() {
          return this;
        }
      };
    }
  };
}

test("evento ja concluido com sucesso e tratado como duplicado", async () => {
  const resultado = await recordWebhookEvent({
    eventId: "req-1",
    payload: {},
    supabase: supabaseFake({
      existing: { id: "evt", processed_at: "2026-08-25T12:00:00Z", processing_error: null },
      insertError: { code: "23505" }
    })
  });

  assert.equal(resultado.duplicated, true);
});

// Se a tentativa anterior morreu no meio, a reentrega PRECISA reprocessar —
// senao a confirmacao do pagamento se perde na deduplicacao.
test("evento que falhou antes e reprocessado na reentrega", async () => {
  const resultado = await recordWebhookEvent({
    eventId: "req-1",
    payload: {},
    supabase: supabaseFake({
      existing: {
        id: "evt",
        processed_at: "2026-08-25T12:00:00Z",
        processing_error: "provedor indisponivel"
      },
      insertError: { code: "23505" }
    })
  });

  assert.equal(resultado.duplicated, false);
  assert.equal(resultado.reprocessing, true);
  assert.equal(resultado.id, "evt");
});

test("evento gravado mas nunca processado e reprocessado", async () => {
  const resultado = await recordWebhookEvent({
    eventId: "req-1",
    payload: {},
    supabase: supabaseFake({
      existing: { id: "evt", processed_at: null, processing_error: null },
      insertError: { code: "23505" }
    })
  });

  assert.equal(resultado.duplicated, false);
  assert.equal(resultado.reprocessing, true);
});

// Conferido contra a API real: cobranca pendente volta com
// net_received_amount = 0, nao null. Tratar esse zero como valor liquidado
// faria a margem provisoria virar "0 - custo" — prejuizo inventado em toda
// venda confirmada antes de o dinheiro cair.
test("liquidado zero conta como desconhecido, nao como zero real", () => {
  assert.equal(resolveSettledCents({ settledCents: 0 }), null);
  assert.equal(resolveSettledCents({ settledCents: null }), null);
  assert.equal(resolveSettledCents({}), null);
  assert.equal(resolveSettledCents({ settledCents: 29703 }), 29703);
});

// O pagador e obrigatorio: a API recusa Pix sem ele (payer_cannot_be_nil), e
// tratar o campo como opcional fazia TODA cobranca falhar.
test("Pix sem e-mail do pagador falha antes de chamar o provedor", async () => {
  const { createPixCharge } = await import("../src/payments/mercadopago.js");

  await assert.rejects(
    () => createPixCharge({ amountCents: 300, description: "x", externalReference: "y" }),
    /pagador/
  );
});
