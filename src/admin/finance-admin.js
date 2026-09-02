import "server-only";

import { getAdminSupabaseStatus } from "@/src/admin/order-admin.js";
import { summarizeLedgers } from "@/src/admin/finance-ledger.js";
import { parseAdminDateTimeInput, parseAdminMoneyToCents } from "@/src/admin/admin-form-values.js";
import { recomputeLedger } from "@/src/payments/ledger-reconciliation.js";

const PAYOUT_STATUSES = ["pendente", "repassado", "estornado", "nao_aplicavel"];

function cleanString(value, maxLength = 500) {
  return String(value ?? "")
    .trim()
    .slice(0, maxLength);
}

export async function listAdminLedgers({ limit = 60, supabase } = {}) {
  if (!supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from("order_ledger")
    .select(
      "id, order_id, charged_amount_cents, settled_amount_cents, provider_fee_cents, refunded_amount_cents, estimated_cost_cents, actual_cost_cents, provisional_margin_cents, reconciled_margin_cents, reconciled_at, payout_status, payout_amount_cents, payout_at, payout_approved_by, payout_reference, notes, updated_at"
    )
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(error.message);
  }

  const ledgers = data ?? [];
  const orderIds = ledgers.map((ledger) => ledger.order_id);

  if (orderIds.length === 0) {
    return [];
  }

  const { data: orders } = await supabase
    .from("orders")
    .select("id, order_number, customer_name, operational_status, payment_status, created_at")
    .in("id", orderIds);

  const ordersById = new Map((orders ?? []).map((order) => [order.id, order]));

  return ledgers.map((ledger) => ({
    ...ledger,
    order: ordersById.get(ledger.order_id) ?? null
  }));
}

export async function getAdminFinanceState() {
  const { isConfigured, supabase } = getAdminSupabaseStatus();

  if (!isConfigured) {
    return { isConfigured, ledgers: [], summary: summarizeLedgers([]) };
  }

  const ledgers = await listAdminLedgers({ supabase });

  return { isConfigured, ledgers, summary: summarizeLedgers(ledgers) };
}

/**
 * Registra que uma PESSOA transferiu o dinheiro.
 *
 * O sistema nao move valor nenhum: ele calcula quanto sobra, guarda a obrigacao
 * e espera alguem confirmar a transferencia. Por isso data, valor e aprovador
 * sao obrigatorios — o banco tambem recusa sem eles
 * (`order_ledger_payout_requires_approval`), e a validacao aqui existe so para
 * a mensagem ser legivel.
 */
export async function markLedgerPayout(formData) {
  const { isConfigured, supabase } = getAdminSupabaseStatus();

  if (!isConfigured) {
    throw new Error("Configure a URL do Supabase e uma chave privilegiada do Supabase.");
  }

  const ledgerId = cleanString(formData.get("ledgerId"), 60);
  const payoutStatus = cleanString(formData.get("payoutStatus"), 30) || "repassado";

  if (!ledgerId) {
    throw new Error("Informe o lancamento do ledger.");
  }

  if (!PAYOUT_STATUSES.includes(payoutStatus)) {
    throw new Error("Status de repasse desconhecido.");
  }

  const { data: ledger, error: ledgerError } = await supabase
    .from("order_ledger")
    .select("id, order_id, payout_status, reconciled_margin_cents, provisional_margin_cents")
    .eq("id", ledgerId)
    .maybeSingle();

  if (ledgerError || !ledger) {
    throw new Error("Lancamento nao encontrado.");
  }

  const patch = { payout_status: payoutStatus };

  if (payoutStatus === "repassado") {
    const approvedBy = cleanString(formData.get("payoutApprovedBy"), 120);
    const reference = cleanString(formData.get("payoutReference"), 180);
    const payoutAt = parseAdminDateTimeInput(formData.get("payoutAt"));
    const amountCents = parseAdminMoneyToCents(formData.get("payoutAmount"), { allowZero: true });

    if (!approvedBy) {
      throw new Error("Informe quem aprovou o repasse.");
    }

    if (!reference) {
      throw new Error("Informe a referencia da transferencia (comprovante, Pix ou TED).");
    }

    if (!payoutAt) {
      throw new Error("Informe a data em que a transferencia foi feita.");
    }

    if (amountCents === null) {
      throw new Error("Informe o valor transferido.");
    }

    patch.payout_amount_cents = amountCents;
    patch.payout_approved_by = approvedBy;
    patch.payout_at = payoutAt;
    patch.payout_reference = reference;
  } else {
    // Voltar de "repassado" sem limpar os campos deixaria um comprovante orfao
    // apontando para uma transferencia que o painel diz nao ter acontecido.
    patch.payout_amount_cents = null;
    patch.payout_approved_by = null;
    patch.payout_at = null;
    patch.payout_reference = null;
  }

  const { error: updateError } = await supabase
    .from("order_ledger")
    .update(patch)
    .eq("id", ledgerId);

  if (updateError) {
    throw new Error(updateError.message);
  }

  await supabase.from("audit_logs").insert({
    action: "ledger_repasse_registrado",
    metadata: {
      aprovadoPor: patch.payout_approved_by,
      statusAnterior: ledger.payout_status,
      statusNovo: payoutStatus,
      valorCents: patch.payout_amount_cents ?? null
    },
    order_id: ledger.order_id
  });

  return { ledgerId, orderId: ledger.order_id, payoutStatus };
}

export async function reconcileAdminLedger(formData) {
  const { isConfigured, supabase } = getAdminSupabaseStatus();

  if (!isConfigured) {
    throw new Error("Configure a URL do Supabase e uma chave privilegiada do Supabase.");
  }

  const orderId = cleanString(formData.get("orderId"), 60);

  if (!orderId) {
    throw new Error("Informe o pedido a reconciliar.");
  }

  const result = await recomputeLedger({ orderId, supabase });

  if (!result.ok) {
    throw new Error("Nao foi possivel reconciliar este lancamento.");
  }

  return result;
}
