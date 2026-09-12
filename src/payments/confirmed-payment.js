import { logServerEvent } from "../lib/logger.js";

import { resolveOrderChargeCents, upsertProvisionalLedger } from "./payment-backend.js";
import { notifyOperatorOfPendingPurchase } from "./supplier-automation-email.js";
import { runSupplierAutomation } from "./supplier-automation.js";

const STATUS_CONFIRMADO = "pagamento_confirmado";

/**
 * Tudo o que precisa acontecer quando um pagamento e confirmado.
 *
 * Existem DOIS caminhos ate a confirmacao, e os dois passam por aqui:
 *
 * - o webhook, para Pix e boleto (e para o cartao que confirma depois);
 * - a propria rota de cobranca do cartao, que recebe "aprovado" na resposta da
 *   API e ja grava o status final no pagamento.
 *
 * Sem este ponto unico, o cartao aprovado na hora caia num vazio: a rota de
 * cobranca gravava `pagamento_confirmado` em `payments`, e o webhook que
 * chegava depois via "status inalterado" e nao fazia nada — o pedido ficava
 * eternamente "aguardando pagamento", sem ledger e sem compra interna.
 *
 * Toda escrita daqui e idempotente (UNIQUE em `order_ledger.order_id` e em
 * `supplier_purchases.automation_key`), entao chamar duas vezes e seguro — e e
 * exatamente o que garante que uma falha no meio se conserte na proxima vez.
 */
export async function applyConfirmedPaymentEffects({
  orderId,
  paymentId,
  providerPayment,
  supabase
}) {
  if (!orderId || !paymentId) {
    return { motivo: "sem_pedido", ok: false };
  }

  await supabase
    .from("orders")
    .update({ payment_status: STATUS_CONFIRMADO })
    .eq("id", orderId)
    .neq("payment_status", STATUS_CONFIRMADO);

  const { estimatedCostCents } = await resolveOrderChargeCents(orderId, supabase);

  await upsertProvisionalLedger({
    estimatedCostCents,
    orderId,
    paymentId,
    providerPayment,
    supabase
  });

  // Prepara a compra interna e avisa o operador. NAO compra no fornecedor:
  // isso continua sendo um ato humano, por decisao do dono da loja.
  const automacao = await runSupplierAutomation({ orderId, paymentId, supabase });

  if (automacao.motivo === "criada") {
    await notifyOperatorOfPendingPurchase({ order: automacao.order });
  }

  logServerEvent("info", "pagamento_confirmado_aplicado", {
    automacao: automacao.motivo,
    orderId
  });

  return { automacao, ok: true };
}
