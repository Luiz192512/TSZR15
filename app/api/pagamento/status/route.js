import { consumeRateLimit, getRequestIp, rateLimitProfiles } from "@/src/lib/rate-limit.js";
import { createRateLimitResponse } from "@/src/lib/rate-limit-response.js";
import { createServiceRoleSupabaseClient } from "@/src/lib/supabase/admin.js";
import { isOnlinePaymentEnabled } from "@/src/payments/payment-config.js";

const ORDER_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function erro(message, status) {
  return Response.json({ error: message }, { status });
}

/**
 * Consulta de status para a tela de pagamento.
 *
 * O Pix confirma por webhook, entao a tela precisa perguntar. Esta rota so LE:
 * nao cria cobranca, nao muda status, nao aceita corpo.
 *
 * O que sai daqui e so o que o proprio cliente ja sabe — se pagou, quanto e ate
 * quando. Taxa, custo, margem e qualquer identificador do provedor ficam de
 * fora, mesmo que o ledger ja os tenha calculado.
 */
export async function GET(request) {
  if (!isOnlinePaymentEnabled()) {
    return erro("Pagamento online indisponivel.", 404);
  }

  const orderId = new URL(request.url).searchParams.get("orderId")?.trim() ?? "";

  if (!ORDER_ID_PATTERN.test(orderId)) {
    return erro("Pedido invalido.", 400);
  }

  const supabase = createServiceRoleSupabaseClient();

  if (!supabase) {
    return erro("Servico indisponivel no momento.", 503);
  }

  const rateLimit = await consumeRateLimit({
    ...rateLimitProfiles.paymentStatus,
    identifier: getRequestIp(request),
    supabase
  });

  if (!rateLimit.allowed) {
    return createRateLimitResponse(rateLimit);
  }

  const { data: payment, error } = await supabase
    .from("payments")
    .select("amount_cents, expires_at, paid_at, payment_method_id, status")
    .eq("order_id", orderId)
    .maybeSingle();

  if (error) {
    return erro("Nao foi possivel consultar o pagamento.", 500);
  }

  if (!payment) {
    return erro("Pagamento nao encontrado.", 404);
  }

  return Response.json(
    {
      amountCents: payment.amount_cents ?? 0,
      expiresAt: payment.expires_at,
      methodId: payment.payment_method_id,
      paidAt: payment.paid_at,
      status: payment.status
    },
    // Status de pagamento muda por webhook: uma resposta em cache mostraria
    // "aguardando" para um pedido ja pago.
    { headers: { "cache-control": "no-store" } }
  );
}
