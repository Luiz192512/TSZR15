import { logServerEvent } from "../lib/logger.js";
import { captureServerError } from "../lib/monitoring.js";
import { consumeRateLimit, getRequestIp, rateLimitProfiles } from "../lib/rate-limit.js";
import { createRateLimitResponse } from "../lib/rate-limit-response.js";
import { createServiceRoleSupabaseClient } from "../lib/supabase/admin.js";
import { isJsonRequest, isSameOriginRequest } from "../security/origin.js";
import { applyConfirmedPaymentEffects } from "./confirmed-payment.js";
import { isPaymentLinkExpired, PAYMENT_LINK_TTL_DAYS } from "./payment-link.js";
import { PaymentBackendError, resolveOrderChargeCents } from "./payment-backend.js";
import { isOnlinePaymentEnabled, PAYMENT_PROVIDER } from "./payment-config.js";

// Preâmbulo comum às três formas de pagamento (Pix, cartão, boleto). Existe
// para que uma regra de segurança — chave de habilitação, mesma origem, rate
// limit — não fique valendo em duas rotas e faltando na terceira.

export function paymentErrorResponse(message, status) {
  return Response.json({ error: message }, { status });
}

const ORDER_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * @returns {Promise<{ response: Response } | { body: object, orderId: string, supabase: object }>}
 */
export async function openChargeRequest(request) {
  if (!isOnlinePaymentEnabled()) {
    return { response: paymentErrorResponse("Pagamento online indisponivel.", 404) };
  }

  if (!isSameOriginRequest(request) || !isJsonRequest(request)) {
    return { response: paymentErrorResponse("Requisicao invalida.", 400) };
  }

  const supabase = createServiceRoleSupabaseClient();

  if (!supabase) {
    return { response: paymentErrorResponse("Servico indisponivel no momento.", 503) };
  }

  const rateLimit = await consumeRateLimit({
    ...rateLimitProfiles.paymentCharge,
    identifier: getRequestIp(request),
    supabase
  });

  if (!rateLimit.allowed) {
    logServerEvent("warn", "payment_charge_rate_limit_blocked", {
      retryAfterSeconds: rateLimit.retryAfterSeconds,
      unavailable: rateLimit.unavailable
    });

    return { response: createRateLimitResponse(rateLimit) };
  }

  let body;

  try {
    body = await request.json();
  } catch {
    return { response: paymentErrorResponse("Corpo invalido.", 400) };
  }

  const orderId = String(body?.orderId ?? "").trim();

  if (!ORDER_ID_PATTERN.test(orderId)) {
    return { response: paymentErrorResponse("Pedido invalido.", 400) };
  }

  return { body, orderId, supabase };
}

/**
 * Pedido pronto para cobrança. O valor vem SEMPRE do recálculo sobre o que
 * está gravado — nada do corpo da requisição participa.
 */
export async function loadChargeableOrder(orderId, supabase) {
  const { amountCents, order } = await resolveOrderChargeCents(orderId, supabase);

  if (order.payment_status === "pagamento_confirmado") {
    throw new PaymentBackendError("Pedido ja esta pago.", { status: 409 });
  }

  // A guarda que importa e esta, nao a da pagina: aqui e onde o dinheiro se
  // move. Um link vencido nao cria cobranca nova mesmo que alguem chame a rota
  // direto, sem passar pela tela.
  if (isPaymentLinkExpired(order)) {
    throw new PaymentBackendError(
      `Este link de pagamento venceu (vale ${PAYMENT_LINK_TTL_DAYS} dias). Fale com o atendimento para receber um novo.`,
      { status: 410 }
    );
  }

  // O provedor recusa cobranca sem pagador. O e-mail vem do PEDIDO, nunca do
  // corpo da requisicao: aceitar do cliente deixaria qualquer um associar a
  // cobranca de um pedido alheio ao proprio e-mail.
  if (!order.customer_email) {
    throw new PaymentBackendError(
      "Pedido sem e-mail do cliente: o provedor recusa cobranca sem pagador.",
      { status: 409 }
    );
  }

  const { data: payment, error } = await supabase
    .from("payments")
    .select("id, status, provider_payment_id")
    .eq("order_id", orderId)
    .maybeSingle();

  if (error) {
    throw new PaymentBackendError("Nao foi possivel ler o pagamento.", { status: 500 });
  }

  if (!payment) {
    throw new PaymentBackendError("Pagamento do pedido nao encontrado.", { status: 409 });
  }

  return { amountCents, order, payment };
}

export async function persistProviderCharge({ charge, methodId, paymentId, supabase }) {
  const { error } = await supabase
    .from("payments")
    .update({
      amount_cents: charge.amountCents,
      expires_at: charge.expiresAt,
      payment_method_id: methodId,
      paid_at: charge.paidAt,
      provider: PAYMENT_PROVIDER,
      provider_fee_cents: charge.feeCents ?? 0,
      provider_payload: charge.raw ?? {},
      provider_payment_id: charge.providerPaymentId,
      settled_amount_cents: charge.settledCents,
      status: charge.status,
      updated_by: "checkout"
    })
    .eq("id", paymentId);

  if (error) {
    throw new PaymentBackendError("Nao foi possivel gravar a cobranca.", { status: 500 });
  }
}

/**
 * Escrituração de uma cobrança que o provedor JÁ aceitou.
 *
 * A partir do retorno do provedor o dinheiro saiu (cartão) ou a cobrança existe
 * (Pix, boleto). Tudo daqui para frente é registro nosso, e registro nosso não
 * pode virar "não foi possível processar" na tela: o cliente tentaria de novo e
 * pagaria duas vezes.
 *
 * Por isso esta função NUNCA lança. Quando a escrita falha, ela grava um evento
 * de cobrança órfã — com o id do provedor, que é o que permite a um humano
 * achar o pagamento no painel — e devolve `false`. O webhook conserta sozinho
 * na entrega seguinte, porque `applyConfirmedPaymentEffects` é idempotente.
 */
export async function finalizeCharge({ charge, methodId, orderId, paymentId, supabase }) {
  try {
    await persistProviderCharge({ charge, methodId, paymentId, supabase });
  } catch (error) {
    // A pior falha do fluxo: a cobrança existe no provedor e não existe aqui.
    // Sem provider_payment_id gravado, nem o webhook consegue reconciliar.
    logServerEvent("error", "payment_charge_orfa", {
      methodId,
      orderId,
      providerPaymentId: charge.providerPaymentId,
      status: charge.status
    });
    await captureServerError(error, {
      orderId,
      providerPaymentId: charge.providerPaymentId,
      stage: "payment-persist"
    });

    return { escriturada: false };
  }

  if (charge.status !== "pagamento_confirmado") {
    return { escriturada: true };
  }

  try {
    await applyConfirmedPaymentEffects({ orderId, paymentId, providerPayment: charge, supabase });
  } catch (error) {
    // Menos grave: o pagamento está gravado, então o webhook reaplica os
    // efeitos na próxima entrega. Ainda assim precisa aparecer no log — se o
    // webhook não chegar, o pedido fica sem compra interna.
    logServerEvent("error", "payment_efeitos_falharam", {
      methodId,
      orderId,
      providerPaymentId: charge.providerPaymentId
    });
    await captureServerError(error, { orderId, stage: "payment-confirmed-effects" });

    return { escriturada: true, efeitosAplicados: false };
  }

  return { efeitosAplicados: true, escriturada: true };
}
