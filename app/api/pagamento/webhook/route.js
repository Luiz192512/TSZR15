import { logServerEvent } from "@/src/lib/logger.js";
import { captureServerError } from "@/src/lib/monitoring.js";
import { consumeRateLimit, getRequestIp, rateLimitProfiles } from "@/src/lib/rate-limit.js";
import { createRateLimitResponse } from "@/src/lib/rate-limit-response.js";
import { createServiceRoleSupabaseClient } from "@/src/lib/supabase/admin.js";
import { getProviderPayment, PaymentProviderError } from "@/src/payments/mercadopago.js";
import { applyConfirmedPaymentEffects } from "@/src/payments/confirmed-payment.js";
import {
  applyProviderPayment,
  markWebhookEventProcessed,
  recordWebhookEvent
} from "@/src/payments/payment-backend.js";
import { getPaymentWebhookSecret, isOnlinePaymentEnabled } from "@/src/payments/payment-config.js";
import { verifyWebhookSignature } from "@/src/payments/mercadopago-signature.js";
import { reverseLedger, undoSupplierAutomation } from "@/src/payments/supplier-automation.js";

// Estados em que o dinheiro voltou ou nunca chegou. `recusado` e `expirado`
// ficam de fora: neles a automacao nunca rodou, entao nao ha o que desfazer.
const REVERSOES = new Set(["reembolsado", "reembolsado_parcial", "estornado", "cancelado"]);

// O provedor reenvia o evento enquanto nao recebe 2xx. Responder 200 em caso
// ja tratado (duplicado, fora de ordem, desconhecido) interrompe o reenvio;
// responder 5xx pede retentativa de verdade.
function ok(reason) {
  return Response.json({ reason, received: true });
}

export async function POST(request) {
  if (!isOnlinePaymentEnabled()) {
    return Response.json({ error: "Pagamento online indisponivel." }, { status: 404 });
  }

  let payload;

  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Corpo invalido." }, { status: 400 });
  }

  const providerPaymentId = String(payload?.data?.id ?? "").trim();
  const requestId = request.headers.get("x-request-id") ?? "";

  // A assinatura e verificada ANTES de qualquer acesso ao banco. Requisicao nao
  // autenticada nao consome conexao, nao gasta escrita do rate limit e nao
  // deixa rastro em payment_webhook_events: o HMAC e barato, a ida ao banco
  // nao. Sem esta ordem, qualquer um na internet gera carga no Postgres.
  const signature = await verifyWebhookSignature({
    dataId: providerPaymentId,
    requestId,
    secret: getPaymentWebhookSecret(),
    signatureHeader: request.headers.get("x-signature")
  });

  if (!signature.valid) {
    logServerEvent("warn", "payment_webhook_signature_rejected", {
      reason: signature.reason,
      requestId
    });

    return Response.json({ error: "Assinatura invalida." }, { status: 401 });
  }

  // Este handler entende UM tipo de evento: "payment" (no painel, "Pagamentos
  // (legacy)"), cujo data.id e um id de pagamento consultavel em /v1/payments.
  //
  // Qualquer outro evento assinado — Order, contestacao, alerta de fraude — traz
  // um id de OUTRA entidade. Sem este filtro, a rota buscaria esse id como se
  // fosse pagamento, falharia, devolveria 5xx e o provedor reenviaria para
  // sempre. Responder 200 e o que encerra a reentrega.
  const eventType = String(payload?.type ?? payload?.action ?? "").toLowerCase();

  if (eventType && !eventType.startsWith("payment")) {
    logServerEvent("info", "payment_webhook_tipo_ignorado", { eventType, requestId });

    return ok("tipo_nao_tratado");
  }

  if (!providerPaymentId) {
    return Response.json({ error: "Evento sem identificador de pagamento." }, { status: 400 });
  }

  const serviceSupabase = createServiceRoleSupabaseClient();

  if (!serviceSupabase) {
    return Response.json({ error: "Servico indisponivel." }, { status: 503 });
  }

  const rateLimit = await consumeRateLimit({
    ...rateLimitProfiles.paymentWebhook,
    identifier: getRequestIp(request),
    supabase: serviceSupabase
  });

  if (!rateLimit.allowed) {
    logServerEvent("warn", "payment_webhook_rate_limit_blocked", {
      retryAfterSeconds: rateLimit.retryAfterSeconds
    });

    return createRateLimitResponse(rateLimit);
  }

  // Identificador do evento: o provedor manda x-request-id unico por entrega.
  // Sem ele, cai para o par (tipo, pagamento), que ainda deduplica o reenvio
  // do mesmo estado.
  const eventId = requestId || `${payload?.type ?? "payment"}:${providerPaymentId}`;

  let eventRow;

  try {
    eventRow = await recordWebhookEvent({
      eventId,
      eventType: payload?.type ?? payload?.action ?? null,
      payload,
      providerPaymentId,
      signatureValid: true,
      supabase: serviceSupabase
    });
  } catch (error) {
    captureServerError(error, { route: "payment-webhook" });

    return Response.json({ error: "Falha ao registrar evento." }, { status: 500 });
  }

  if (eventRow.duplicated) {
    logServerEvent("info", "payment_webhook_duplicated", { eventId, providerPaymentId });

    return ok("evento_duplicado");
  }

  try {
    // O estado vem de uma consulta ao provedor, nunca do corpo do webhook: o
    // corpo diz apenas QUAL pagamento mudou.
    const providerPayment = await getProviderPayment(providerPaymentId);
    const result = await applyProviderPayment({ providerPayment, supabase: serviceSupabase });

    // "status inalterado" e o caso do cartao aprovado na hora: a rota de
    // cobranca ja gravou o status final, entao o webhook nao ve mudanca. Os
    // efeitos sao idempotentes, entao rodar de novo e barato e conserta uma
    // falha parcial daquela rota em vez de deixar o pedido pendurado.
    if (
      !result.applied &&
      result.reason === "status_inalterado" &&
      providerPayment.status === "pagamento_confirmado"
    ) {
      await applyConfirmedPaymentEffects({
        orderId: result.orderId,
        paymentId: result.paymentId,
        providerPayment,
        supabase: serviceSupabase
      });
    }

    if (!result.applied) {
      await markWebhookEventProcessed({
        eventRowId: eventRow.id,
        orderId: result.orderId,
        paymentId: result.paymentId,
        supabase: serviceSupabase
      });

      logServerEvent("info", "payment_webhook_ignorado", {
        eventId,
        motivo: result.reason,
        providerPaymentId
      });

      return ok(result.reason);
    }

    if (providerPayment.status === "pagamento_confirmado") {
      await applyConfirmedPaymentEffects({
        orderId: result.orderId,
        paymentId: result.paymentId,
        providerPayment,
        supabase: serviceSupabase
      });
    }

    // Dinheiro de volta: desfaz o que a automacao preparou e estorna o ledger.
    // `autorizado` NAO entra aqui — cartao autorizado e dinheiro reservado, e o
    // pedido nem chegou a disparar automacao.
    if (REVERSOES.has(providerPayment.status)) {
      await undoSupplierAutomation({
        motivo: providerPayment.status,
        orderId: result.orderId,
        supabase: serviceSupabase
      });

      await reverseLedger({
        motivo: providerPayment.status,
        orderId: result.orderId,
        refundedCents: providerPayment.refundedCents ?? 0,
        supabase: serviceSupabase
      });
    }

    await markWebhookEventProcessed({
      eventRowId: eventRow.id,
      orderId: result.orderId,
      paymentId: result.paymentId,
      supabase: serviceSupabase
    });

    logServerEvent("info", "payment_webhook_aplicado", {
      eventId,
      orderId: result.orderId,
      status: providerPayment.status
    });

    return ok("aplicado");
  } catch (error) {
    await markWebhookEventProcessed({
      error: String(error?.message ?? error).slice(0, 400),
      eventRowId: eventRow.id,
      supabase: serviceSupabase
    });

    if (error instanceof PaymentProviderError && error.retryable) {
      // 5xx faz o provedor reenviar. O evento ja esta gravado, entao o reenvio
      // cai na deduplicacao — mas o registro fica com o erro para auditoria.
      return Response.json({ error: "Provedor indisponivel." }, { status: 503 });
    }

    captureServerError(error, { route: "payment-webhook" });

    return Response.json({ error: "Falha ao processar evento." }, { status: 500 });
  }
}
