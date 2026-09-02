import { resolveOrderCostCents } from "../admin/order-analytics.js";
import { logServerEvent } from "../lib/logger.js";

import { resolveSettledCents } from "./payment-backend.js";

// Um ledger estornado registra que o dinheiro voltou. Recomputar por cima
// ressuscitaria a margem de um pedido que nao existe mais.
const ESTADO_FINAL = "estornado";

function sumCents(values) {
  return values.reduce((total, value) => total + (Number.isInteger(value) ? value : 0), 0);
}

/**
 * Custo real gasto no fornecedor, ou `null` quando nada foi registrado ainda.
 *
 * Zero e um custo real possivel (brinde, frete gratis) — so a AUSENCIA de
 * linha com valor significa desconhecido. Por isso o `null` em vez de `0`.
 */
export function resolveActualCostCents(purchases = []) {
  const comValor = purchases.filter(
    (compra) =>
      Number.isInteger(compra.product_cost_cents) || Number.isInteger(compra.shipping_cost_cents)
  );

  if (comValor.length === 0) {
    return null;
  }

  return sumCents(
    comValor.flatMap((compra) => [compra.product_cost_cents, compra.shipping_cost_cents])
  );
}

/**
 * Recomputa o ledger de um pedido a partir das fontes.
 *
 * RECOMPUTA, nao aplica deltas: rodar duas vezes da o mesmo resultado, e uma
 * reconciliacao perdida se conserta rodando de novo. E o motivo de a chamada
 * poder ficar fora da transacao do admin sem risco de o ledger dessincronizar.
 *
 * O dinheiro recebido segue a MESMA formula do ledger provisorio
 * (`upsertProvisionalLedger`): `settled` ja vem liquido de taxa no provedor,
 * entao a taxa so entra quando ele nao informou o liquido. Subtrair a taxa das
 * duas maneiras inventaria um prejuizo que nao existe.
 */
export async function recomputeLedger({ orderId, supabase }) {
  if (!orderId) {
    return { motivo: "sem_pedido", ok: false };
  }

  const { data: ledger, error: ledgerError } = await supabase
    .from("order_ledger")
    .select("id, payment_id, payout_status")
    .eq("order_id", orderId)
    .maybeSingle();

  if (ledgerError) {
    logServerEvent("error", "ledger_leitura_falhou", { motivo: ledgerError.message, orderId });

    return { motivo: "falha_ao_ler_ledger", ok: false };
  }

  // Pedido sem pagamento online nunca teve ledger. Nao e erro: o fluxo de
  // WhatsApp continua valido e nao passa por aqui.
  if (!ledger) {
    return { motivo: "sem_ledger", ok: true };
  }

  if (ledger.payout_status === ESTADO_FINAL) {
    return { motivo: "estornado", ok: true };
  }

  const [{ data: pagamento }, { data: itens }, { data: compras }] = await Promise.all([
    supabase
      .from("payments")
      .select(
        "id, amount_cents, settled_amount_cents, provider_fee_cents, refunded_amount_cents, status"
      )
      .eq("order_id", orderId)
      .eq("status", "pagamento_confirmado")
      .order("paid_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("order_items").select("subtotal_cost_cents").eq("order_id", orderId),
    supabase
      .from("supplier_purchases")
      .select("product_cost_cents, shipping_cost_cents")
      .eq("order_id", orderId)
  ]);

  if (!pagamento) {
    return { motivo: "sem_pagamento_confirmado", ok: true };
  }

  const charged = pagamento.amount_cents ?? 0;
  const fee = pagamento.provider_fee_cents ?? 0;
  const refunded = pagamento.refunded_amount_cents ?? 0;
  // Zero significa "o provedor ainda nao informou", nao "recebemos zero".
  const settled = resolveSettledCents({ settledCents: pagamento.settled_amount_cents });
  const received = settled ?? charged - fee;

  const estimatedCost = sumCents((itens ?? []).map((item) => item.subtotal_cost_cents));
  const actualCost = resolveActualCostCents(compras ?? []);
  const custoParaMargem = resolveOrderCostCents({
    actualCostCents: actualCost,
    estimatedCostCents: estimatedCost
  });

  const provisionalMargin = received - refunded - estimatedCost;
  const reconciledMargin = actualCost === null ? null : received - refunded - actualCost;

  const { error: updateError } = await supabase
    .from("order_ledger")
    .update({
      actual_cost_cents: actualCost,
      charged_amount_cents: charged,
      estimated_cost_cents: estimatedCost,
      payment_id: pagamento.id,
      provider_fee_cents: fee,
      provisional_margin_cents: provisionalMargin,
      reconciled_at: reconciledMargin === null ? null : new Date().toISOString(),
      reconciled_margin_cents: reconciledMargin,
      refunded_amount_cents: refunded,
      settled_amount_cents: settled
    })
    .eq("id", ledger.id);

  if (updateError) {
    logServerEvent("error", "ledger_reconciliacao_falhou", {
      motivo: updateError.message,
      orderId
    });

    return { motivo: "falha_ao_gravar", ok: false };
  }

  logServerEvent("info", "ledger_reconciliado", {
    custoConsiderado: custoParaMargem,
    orderId,
    reconciliado: reconciledMargin !== null
  });

  return {
    actualCostCents: actualCost,
    estimatedCostCents: estimatedCost,
    motivo: reconciledMargin === null ? "sem_custo_real" : "reconciliado",
    ok: true,
    provisionalMarginCents: provisionalMargin,
    receivedCents: received,
    reconciledMarginCents: reconciledMargin
  };
}
