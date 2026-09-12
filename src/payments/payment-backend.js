import { logServerEvent } from "../lib/logger.js";

import { PAYMENT_PROVIDER } from "./payment-config.js";

const UNIQUE_VIOLATION = "23505";

/**
 * Precedência dos estados de pagamento.
 *
 * O provedor reenvia eventos fora de ordem: o "aprovado" pode chegar depois do
 * "reembolsado". Sem esta escala, o evento atrasado reabriria um pedido já
 * encerrado. A regra é só avançar, nunca retroceder.
 */
const STATUS_RANK = {
  aguardando_pagamento: 0,
  em_analise: 1,
  recusado: 2,
  expirado: 2,
  cancelado: 2,
  autorizado: 3,
  pagamento_confirmado: 4,
  reembolsado_parcial: 5,
  reembolsado: 6,
  estornado: 7
};

export function statusRank(status) {
  return STATUS_RANK[String(status ?? "")] ?? -1;
}

export function isStatusRegression(currentStatus, nextStatus) {
  return statusRank(nextStatus) < statusRank(currentStatus);
}

export class PaymentBackendError extends Error {
  constructor(message, { status = 400 } = {}) {
    super(message);
    this.name = "PaymentBackendError";
    this.status = status;
  }
}

/**
 * Valor a cobrar, recalculado a partir do que está GRAVADO no pedido.
 *
 * O cliente nunca informa quanto vai pagar. Se o total do pedido divergir da
 * soma dos itens mais frete menos desconto, a cobrança é abortada: divergência
 * aqui significa pedido corrompido ou adulterado, não um arredondamento.
 */
export async function resolveOrderChargeCents(orderId, supabase) {
  const { data: order, error } = await supabase
    .from("orders")
    .select(
      // Telefone, documento e snapshot entram porque o provedor usa esses
      // campos na analise antifraude: pagador identificado tem aprovacao mais
      // alta. Sao dados que o pedido JA tem — nada novo e pedido ao cliente.
      "id, total_cents, subtotal_cents, discount_cents, shipping_cents, payment_status, customer_email, customer_name, customer_phone, customer_whatsapp, customer_tax_id, customer_snapshot, address_snapshot, created_at"
    )
    .eq("id", orderId)
    .maybeSingle();

  if (error) {
    throw new PaymentBackendError("Nao foi possivel ler o pedido.", { status: 500 });
  }

  if (!order) {
    throw new PaymentBackendError("Pedido nao encontrado.", { status: 404 });
  }

  const { data: items, error: itemsError } = await supabase
    .from("order_items")
    // Nome, categoria e preco unitario alimentam `additional_info`: sem eles o
    // antifraude decide no escuro, e decidir no escuro significa recusar mais.
    .select(
      "subtotal_cents, subtotal_cost_cents, product_id, product_name, product_slug, quantity, unit_price_cents, variation, size, storefront_category_ids"
    )
    .eq("order_id", orderId);

  if (itemsError) {
    throw new PaymentBackendError("Nao foi possivel ler os itens do pedido.", { status: 500 });
  }

  if (!items?.length) {
    throw new PaymentBackendError("Pedido sem itens.", { status: 409 });
  }

  const itemsTotal = items.reduce((total, item) => total + Number(item.subtotal_cents ?? 0), 0);
  const expected =
    itemsTotal + Number(order.shipping_cents ?? 0) - Number(order.discount_cents ?? 0);

  if (expected !== Number(order.total_cents)) {
    throw new PaymentBackendError("Total do pedido nao confere com os itens.", { status: 409 });
  }

  if (expected <= 0) {
    throw new PaymentBackendError("Pedido sem valor a cobrar.", { status: 409 });
  }

  return {
    amountCents: expected,
    estimatedCostCents: items.reduce(
      (total, item) => total + Number(item.subtotal_cost_cents ?? 0),
      0
    ),
    // Devolvidos para as rotas montarem `additional_info` sem reler o pedido.
    items,
    order
  };
}

/**
 * Registra o evento do webhook. A UNIQUE em (provider, provider_event_id) é o
 * que torna o processamento idempotente.
 *
 * Reentrada é tratada com cuidado: "já vi este evento" não é o mesmo que "já
 * processei este evento com sucesso". Se a tentativa anterior morreu no meio
 * (provedor fora do ar, erro de gravação), a entrega repetida PRECISA
 * reprocessar — senão a confirmação do pagamento se perde para sempre na
 * deduplicação. Só evento concluído sem erro é tratado como duplicado.
 */
export async function recordWebhookEvent({
  eventId,
  eventType,
  payload,
  providerPaymentId,
  signatureValid,
  supabase
}) {
  const { data, error } = await supabase
    .from("payment_webhook_events")
    .insert({
      event_type: eventType,
      payload,
      provider: PAYMENT_PROVIDER,
      provider_event_id: eventId,
      provider_payment_id: providerPaymentId,
      signature_valid: signatureValid
    })
    .select("id")
    .maybeSingle();

  if (!error) {
    return { duplicated: false, id: data?.id ?? null };
  }

  if (error.code !== UNIQUE_VIOLATION) {
    throw new PaymentBackendError("Nao foi possivel registrar o evento.", { status: 500 });
  }

  const { data: existing, error: readError } = await supabase
    .from("payment_webhook_events")
    .select("id, processed_at, processing_error")
    .eq("provider", PAYMENT_PROVIDER)
    .eq("provider_event_id", eventId)
    .maybeSingle();

  if (readError) {
    throw new PaymentBackendError("Nao foi possivel ler o evento anterior.", { status: 500 });
  }

  const concluidoComSucesso = Boolean(existing?.processed_at) && !existing?.processing_error;

  return {
    duplicated: concluidoComSucesso,
    id: existing?.id ?? null,
    reprocessing: !concluidoComSucesso
  };
}

export async function markWebhookEventProcessed({
  error: processingError,
  eventRowId,
  orderId,
  paymentId,
  supabase
}) {
  if (!eventRowId) {
    return;
  }

  await supabase
    .from("payment_webhook_events")
    .update({
      order_id: orderId ?? null,
      payment_id: paymentId ?? null,
      processed_at: new Date().toISOString(),
      // Limpar o erro no sucesso importa: um evento que falhou e depois deu
      // certo precisa passar a contar como concluido, senao toda entrega
      // seguinte reprocessa.
      processing_error: processingError ?? null
    })
    .eq("id", eventRowId);
}

// Id de pedido que as rotas de cobranca gravam em `external_reference`.
const PEDIDO_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// `payment_type_id` do provedor -> `payment_method_id` da loja.
const METODO_DO_TIPO = {
  bank_transfer: "pix",
  credit_card: "cartao",
  debit_card: "cartao",
  prepaid_card: "cartao",
  ticket: "boleto"
};

/**
 * Pagamento aprovado de uma cobranca que ja nao e a atual do pedido.
 *
 * Existe UMA linha em `payments` por pedido, e cada cobranca nova sobrescreve o
 * `provider_payment_id` dela. Visto no staging: um pedido gerou duas cobrancas
 * com 25 segundos de diferenca, e a linha guardou so a segunda. Se o cliente
 * tivesse pago a primeira — um Pix copiado antes de trocar para o boleto, por
 * exemplo — o webhook procuraria pelo id, nao acharia a linha e ignoraria um
 * pagamento recebido: dinheiro na conta, pedido "aguardando".
 *
 * A reconciliacao usa `external_reference`, que as tres rotas de cobranca
 * preenchem com o id do pedido, e so vale para pagamento APROVADO: uma cobranca
 * antiga ainda pendente, ou cancelada, nao pode sobrescrever a atual.
 *
 * Dois casos nao se resolvem sozinhos e voltam com motivo para uma pessoa:
 *   - o pedido ja esta pago por outra cobranca: o cliente pagou duas vezes, e
 *     uma delas precisa ser estornada;
 *   - o valor aprovado nao bate com o do pedido.
 */
async function reconciliarCobrancaSubstituida({ providerPayment, resolverValorDoPedido, supabase }) {
  const desconhecido = { applied: false, reason: "pagamento_desconhecido" };
  const orderId = String(providerPayment.externalReference ?? "");

  if (providerPayment.status !== "pagamento_confirmado" || !PEDIDO_ID.test(orderId)) {
    return desconhecido;
  }

  const { data: atual, error } = await supabase
    .from("payments")
    .select("id, order_id, status, amount_cents")
    .eq("provider", PAYMENT_PROVIDER)
    .eq("order_id", orderId)
    .maybeSingle();

  if (error) {
    throw new PaymentBackendError("Nao foi possivel ler o pagamento do pedido.", { status: 500 });
  }

  // Pedido de outro ambiente apontando para o mesmo webhook.
  if (!atual) {
    return desconhecido;
  }

  const contexto = {
    orderId,
    paymentId: atual.id,
    providerPaymentId: providerPayment.providerPaymentId
  };

  if (atual.status === "pagamento_confirmado") {
    logServerEvent("error", "pagamento_em_duplicidade", contexto);

    return { applied: false, orderId, paymentId: atual.id, reason: "pagamento_duplicado" };
  }

  const { amountCents } = await resolverValorDoPedido(orderId, supabase);

  if (providerPayment.amountCents !== amountCents) {
    logServerEvent("error", "pagamento_substituido_valor_divergente", {
      ...contexto,
      valorAprovadoCents: providerPayment.amountCents,
      valorDoPedidoCents: amountCents
    });

    return { applied: false, orderId, paymentId: atual.id, reason: "valor_divergente" };
  }

  const metodo = METODO_DO_TIPO[providerPayment.raw?.payment_type_id];

  // A linha passa a apontar para a cobranca que foi paga: estorno e chargeback
  // dela chegam depois com esse id, e precisam encontrar o pedido.
  const { error: updateError } = await supabase
    .from("payments")
    .update({
      amount_cents: providerPayment.amountCents,
      expires_at: providerPayment.expiresAt,
      ...(metodo ? { payment_method_id: metodo } : {}),
      provider_payment_id: providerPayment.providerPaymentId,
      updated_by: "webhook"
    })
    .eq("id", atual.id)
    .neq("status", "pagamento_confirmado");

  if (updateError) {
    throw new PaymentBackendError("Nao foi possivel reconciliar a cobranca.", { status: 500 });
  }

  logServerEvent("warn", "pagamento_de_cobranca_substituida", contexto);

  return { payment: atual };
}

/**
 * Aplica ao pedido o que o provedor informou. Única fonte de verdade do
 * pagamento — nada aqui aceita dado vindo do navegador.
 *
 * `resolverValorDoPedido` existe para teste; em producao e sempre
 * `resolveOrderChargeCents`.
 */
export async function applyProviderPayment({
  providerPayment,
  resolverValorDoPedido = resolveOrderChargeCents,
  supabase
}) {
  const { data: porId, error } = await supabase
    .from("payments")
    .select("id, order_id, status, amount_cents")
    .eq("provider", PAYMENT_PROVIDER)
    .eq("provider_payment_id", providerPayment.providerPaymentId)
    .maybeSingle();

  if (error) {
    throw new PaymentBackendError("Nao foi possivel ler o pagamento.", { status: 500 });
  }

  let payment = porId;

  // Nao achou pelo id: ou e cobranca de outro ambiente, ou e uma cobranca deste
  // pedido que foi trocada por outra antes de ser paga.
  if (!payment) {
    const substituida = await reconciliarCobrancaSubstituida({
      providerPayment,
      resolverValorDoPedido,
      supabase
    });

    if (!substituida.payment) {
      return substituida;
    }

    payment = substituida.payment;
  }

  if (isStatusRegression(payment.status, providerPayment.status)) {
    return {
      applied: false,
      orderId: payment.order_id,
      paymentId: payment.id,
      reason: "evento_fora_de_ordem"
    };
  }

  if (payment.status === providerPayment.status) {
    return {
      applied: false,
      orderId: payment.order_id,
      paymentId: payment.id,
      reason: "status_inalterado"
    };
  }

  const { error: updateError } = await supabase
    .from("payments")
    .update({
      paid_at: providerPayment.paidAt,
      provider_fee_cents: providerPayment.feeCents ?? 0,
      provider_payload: providerPayment.raw ?? {},
      refunded_amount_cents: providerPayment.refundedCents ?? 0,
      settled_amount_cents: providerPayment.settledCents,
      status: providerPayment.status,
      updated_by: "webhook"
    })
    .eq("id", payment.id);

  if (updateError) {
    throw new PaymentBackendError("Nao foi possivel atualizar o pagamento.", { status: 500 });
  }

  await supabase
    .from("orders")
    .update({ payment_status: providerPayment.status })
    .eq("id", payment.order_id);

  return {
    applied: true,
    orderId: payment.order_id,
    paymentId: payment.id,
    reason: "atualizado"
  };
}

/**
 * Ledger provisório. Só existe a partir da confirmação do pagamento, e é
 * idempotente: `order_id` é UNIQUE, então o webhook reenviado não cria um
 * segundo ledger para a mesma venda.
 *
 * Entre confirmar e liquidar existe uma janela, e o provedor a representa com
 * ZERO, não com nulo — conferido contra a API: uma cobrança pendente volta com
 * `net_received_amount: 0`. Tratar esse zero como valor real faria a margem
 * provisória virar `0 − custo`, ou seja, prejuízo inventado em toda venda
 * confirmada antes da liquidação. Por isso zero conta como desconhecido, e o
 * ledger cai para "cobrado menos taxa" até o valor real chegar.
 */
export function resolveSettledCents(providerPayment) {
  const settled = providerPayment?.settledCents;

  return Number.isFinite(settled) && settled > 0 ? settled : null;
}

export async function upsertProvisionalLedger({
  estimatedCostCents,
  orderId,
  paymentId,
  providerPayment,
  supabase
}) {
  const charged = providerPayment.amountCents ?? 0;
  const fee = providerPayment.feeCents ?? 0;
  const settled = resolveSettledCents(providerPayment);
  const received = settled ?? charged - fee;

  const { error } = await supabase.from("order_ledger").upsert(
    {
      charged_amount_cents: charged,
      estimated_cost_cents: estimatedCostCents,
      order_id: orderId,
      payment_id: paymentId,
      provider_fee_cents: fee,
      provisional_margin_cents: received - estimatedCostCents,
      refunded_amount_cents: providerPayment.refundedCents ?? 0,
      settled_amount_cents: settled
    },
    { onConflict: "order_id" }
  );

  if (error) {
    throw new PaymentBackendError("Nao foi possivel gravar o ledger.", { status: 500 });
  }
}
