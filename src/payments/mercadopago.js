import { getPaymentAccessToken } from "./payment-config.js";

const API_BASE = "https://api.mercadopago.com";
const REQUEST_TIMEOUT_MS = 12_000;

export class PaymentProviderError extends Error {
  constructor(message, { cause, retryable = false, status = 0 } = {}) {
    super(message);
    this.name = "PaymentProviderError";
    this.cause = cause;
    this.retryable = retryable;
    this.status = status;
  }
}

/**
 * Status do provedor -> status interno de `payments.status`.
 *
 * O provedor emite mais estados do que a loja precisa distinguir. O que não
 * mapear vira `em_analise`, que é o estado seguro: não confirma nada e mantém
 * o pedido visível para o operador.
 */
const STATUS_MAP = {
  approved: "pagamento_confirmado",
  authorized: "autorizado",
  cancelled: "cancelado",
  charged_back: "estornado",
  in_process: "em_analise",
  in_mediation: "em_analise",
  pending: "aguardando_pagamento",
  refunded: "reembolsado",
  rejected: "recusado"
};

export function mapProviderStatus(providerStatus) {
  return STATUS_MAP[String(providerStatus ?? "").toLowerCase()] ?? "em_analise";
}

async function providerRequest(path, { body, idempotencyKey, method = "GET" } = {}) {
  const accessToken = getPaymentAccessToken();

  if (!accessToken) {
    throw new PaymentProviderError("Credencial do provedor de pagamento ausente.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response;

  try {
    response = await fetch(`${API_BASE}${path}`, {
      body: body === undefined ? undefined : JSON.stringify(body),
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        // Sem isto, um retry de rede criaria uma segunda cobranca para o
        // mesmo pedido.
        ...(idempotencyKey ? { "X-Idempotency-Key": idempotencyKey } : {})
      },
      method,
      signal: controller.signal
    });
  } catch (error) {
    // Timeout e falha de rede sao retentaveis; o pedido ainda nao foi cobrado
    // do ponto de vista da loja.
    throw new PaymentProviderError("Provedor de pagamento indisponivel.", {
      cause: error,
      retryable: true
    });
  } finally {
    clearTimeout(timeout);
  }

  const text = await response.text();
  let payload;

  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    // Resposta que nao e JSON: guarda um trecho para o log sem estourar.
    payload = { raw: text.slice(0, 500) };
  }

  if (!response.ok) {
    throw new PaymentProviderError(
      payload?.message ? String(payload.message) : "Provedor de pagamento recusou a requisicao.",
      { retryable: response.status >= 500, status: response.status }
    );
  }

  return payload;
}

/**
 * Cria a cobranca Pix. `amountCents` vem SEMPRE do recalculo do servidor.
 */
export async function createPixCharge({
  amountCents,
  description,
  externalReference,
  idempotencyKey,
  payerEmail
}) {
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new PaymentProviderError("Valor da cobranca invalido.");
  }

  // O provedor RECUSA Pix sem pagador (`payer_cannot_be_nil`). Tratar o e-mail
  // como opcional fazia toda cobranca falhar — so uma chamada real revelou.
  if (!payerEmail) {
    throw new PaymentProviderError("E-mail do pagador ausente: o provedor recusa Pix sem pagador.");
  }

  const payload = await providerRequest("/v1/payments", {
    body: {
      description,
      external_reference: externalReference,
      payer: { email: payerEmail },
      payment_method_id: "pix",
      // A API do provedor trabalha em unidades da moeda, o projeto em centavos.
      transaction_amount: Number((amountCents / 100).toFixed(2))
    },
    idempotencyKey,
    method: "POST"
  });

  return normalizeProviderPayment(payload);
}

/**
 * Cobranca no cartao.
 *
 * `cardToken` vem do SDK do provedor rodando no NAVEGADOR. Numero do cartao,
 * CVV e validade nunca chegam a este servidor — e por isso que o token e o
 * unico campo de cartao aceito aqui. Qualquer coisa alem disso no corpo da
 * requisicao e ignorada de proposito.
 *
 * `capture: true` cobra na hora. Com `false` o provedor apenas AUTORIZA: o
 * dinheiro fica reservado no limite do cliente e ainda nao e da loja, o que no
 * projeto vira o status `autorizado`.
 */
export async function createCardPayment({
  amountCents,
  capture = true,
  cardToken,
  description,
  externalReference,
  idempotencyKey,
  installments = 1,
  issuerId,
  payerEmail,
  paymentMethodId
}) {
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new PaymentProviderError("Valor da cobranca invalido.");
  }

  if (!cardToken) {
    throw new PaymentProviderError("Token do cartao ausente.");
  }

  const payload = await providerRequest("/v1/payments", {
    body: {
      capture,
      description,
      external_reference: externalReference,
      installments: Number(installments) || 1,
      issuer_id: issuerId || undefined,
      payer: payerEmail ? { email: payerEmail } : undefined,
      payment_method_id: paymentMethodId,
      token: cardToken,
      transaction_amount: Number((amountCents / 100).toFixed(2))
    },
    idempotencyKey,
    method: "POST"
  });

  return normalizeProviderPayment(payload);
}

/**
 * Boleto. Fica em aberto por dias: `expires_at` e o que permite a loja
 * distinguir "ainda pode ser pago" de "venceu".
 */
export async function createBoletoPayment({
  amountCents,
  description,
  externalReference,
  idempotencyKey,
  payer
}) {
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new PaymentProviderError("Valor da cobranca invalido.");
  }

  const payload = await providerRequest("/v1/payments", {
    body: {
      description,
      external_reference: externalReference,
      payer: {
        // Sem endereco o emissor devolve `rejected_insufficient_data`. Nao e
        // opcional: foi o que uma cobranca real de sandbox recusou.
        address: payer?.address ?? undefined,
        email: payer?.email,
        first_name: payer?.firstName,
        identification: payer?.identification,
        last_name: payer?.lastName
      },
      payment_method_id: "bolbradesco",
      transaction_amount: Number((amountCents / 100).toFixed(2))
    },
    idempotencyKey,
    method: "POST"
  });

  return normalizeProviderPayment(payload);
}

export async function getProviderPayment(providerPaymentId) {
  const payload = await providerRequest(`/v1/payments/${encodeURIComponent(providerPaymentId)}`);

  return normalizeProviderPayment(payload);
}

function toCents(value) {
  const numeric = Number(value);

  return Number.isFinite(numeric) ? Math.round(numeric * 100) : null;
}

export function normalizeProviderPayment(payload) {
  const transaction = payload?.transaction_details ?? {};
  const fees = Array.isArray(payload?.fee_details) ? payload.fee_details : [];
  const pix = payload?.point_of_interaction?.transaction_data ?? {};

  return {
    amountCents: toCents(payload?.transaction_amount),
    expiresAt: payload?.date_of_expiration ?? null,
    externalReference: payload?.external_reference ?? null,
    // A soma das taxas e o que separa o valor cobrado do valor liquidado.
    feeCents: fees.reduce((total, fee) => total + (toCents(fee?.amount) ?? 0), 0),
    paidAt: payload?.date_approved ?? null,
    providerPaymentId: payload?.id ? String(payload.id) : "",
    providerStatus: payload?.status ?? "",
    // Boleto e cartao devolvem o comprovante/linha digitavel por aqui.
    barcode: payload?.barcode?.content ?? "",
    statusDetail: payload?.status_detail ?? "",
    qrCode: pix.qr_code ?? "",
    qrCodeBase64: pix.qr_code_base64 ?? "",
    // Retorno bruto para `payments.provider_payload`: quando a conciliacao
    // financeira divergir, e isto que diz o que o provedor realmente informou.
    raw: payload ?? {},
    refundedCents: toCents(payload?.transaction_amount_refunded) ?? 0,
    settledCents: toCents(transaction?.net_received_amount),
    status: mapProviderStatus(payload?.status),
    ticketUrl: pix.ticket_url ?? ""
  };
}
