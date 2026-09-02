import { logServerEvent } from "@/src/lib/logger.js";
import { captureServerError } from "@/src/lib/monitoring.js";
import {
  finalizeCharge,
  loadChargeableOrder,
  openChargeRequest,
  paymentErrorResponse
} from "@/src/payments/charge-flow.js";
import { createCardPayment, PaymentProviderError } from "@/src/payments/mercadopago.js";
import { PaymentBackendError } from "@/src/payments/payment-backend.js";

// Mensagem para o cliente por status do provedor. O detalhe cru (`status_detail`)
// fica no log e no provider_payload: dizer "cartao sem limite" na tela entrega
// informacao da conta do titular para quem estiver com o cartao na mao.
const MENSAGEM_POR_STATUS = {
  autorizado: "Pagamento autorizado. A confirmacao sai em instantes.",
  em_analise: "Pagamento em analise. Avisamos assim que houver resposta.",
  pagamento_confirmado: "Pagamento confirmado.",
  recusado: "Pagamento nao autorizado. Tente outro cartao ou outra forma de pagamento."
};

export async function POST(request) {
  const opened = await openChargeRequest(request);

  if (opened.response) {
    return opened.response;
  }

  const { body, orderId, supabase } = opened;

  // Somente o token entra. Numero, CVV e validade ficam no navegador, tokenizados
  // pelo SDK do provedor — nunca trafegam nem sao gravados por este servidor.
  const cardToken = String(body?.cardToken ?? "").trim();
  const paymentMethodId = String(body?.paymentMethodId ?? "").trim();

  if (!cardToken || !paymentMethodId) {
    return paymentErrorResponse("Dados do cartao incompletos.", 400);
  }

  const installments = Number.parseInt(body?.installments ?? 1, 10);

  if (!Number.isInteger(installments) || installments < 1 || installments > 12) {
    return paymentErrorResponse("Numero de parcelas invalido.", 400);
  }

  try {
    const { amountCents, order, payment } = await loadChargeableOrder(orderId, supabase);

    const charge = await createCardPayment({
      amountCents,
      cardToken,
      description: `Pedido ${orderId}`,
      externalReference: orderId,
      // O token do cartao e de uso unico, entao a chave de idempotencia inclui
      // o token: retry de rede nao cobra duas vezes, e uma nova tentativa do
      // cliente (token novo) nao e barrada como duplicada.
      idempotencyKey: `tszr15-card-${orderId}-${cardToken.slice(-12)}`,
      installments,
      issuerId: body?.issuerId,
      // Do pedido, nao do corpo: o cliente nao escolhe o pagador.
      payerEmail: order.customer_email,
      paymentMethodId
    });

    // A partir daqui o cartao JA foi cobrado. Escrituracao que falha nao pode
    // virar erro na tela: o cliente tentaria de novo e pagaria duas vezes.
    // `finalizeCharge` nao lanca — registra a cobranca orfa e segue.
    //
    // Cartao aprovado na hora nao gera evento de MUDANCA no webhook, entao os
    // efeitos da confirmacao saem daqui; sem isso o pedido ficaria
    // "aguardando pagamento" para sempre, sem ledger e sem compra interna.
    const escrituracao = await finalizeCharge({
      charge,
      methodId: "cartao",
      orderId,
      paymentId: payment.id,
      supabase
    });

    logServerEvent("info", "payment_card_charge", {
      escriturada: escrituracao.escriturada,
      installments,
      orderId,
      status: charge.status,
      // status_detail explica a recusa para a operacao (fundos, fraude, dados).
      statusDetail: charge.statusDetail
    });

    return Response.json({
      amountCents,
      installments,
      mensagem: MENSAGEM_POR_STATUS[charge.status] ?? "Pagamento em processamento.",
      status: charge.status
    });
  } catch (error) {
    if (error instanceof PaymentBackendError) {
      return paymentErrorResponse(error.message, error.status);
    }

    if (error instanceof PaymentProviderError) {
      logServerEvent("error", "payment_provider_failed", {
        orderId,
        retryable: error.retryable,
        status: error.status
      });

      return paymentErrorResponse(
        error.retryable
          ? "Provedor de pagamento indisponivel. Tente de novo em instantes."
          : "Nao foi possivel processar o pagamento.",
        error.retryable ? 503 : 502
      );
    }

    captureServerError(error, { route: "payment-card" });

    return paymentErrorResponse("Nao foi possivel processar o pagamento.", 500);
  }
}
