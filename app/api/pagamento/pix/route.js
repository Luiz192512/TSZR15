import { logServerEvent } from "@/src/lib/logger.js";
import { captureServerError } from "@/src/lib/monitoring.js";
import {
  finalizeCharge,
  loadChargeableOrder,
  openChargeRequest,
  paymentErrorResponse
} from "@/src/payments/charge-flow.js";
import { createPixCharge, PaymentProviderError } from "@/src/payments/mercadopago.js";
import { PaymentBackendError } from "@/src/payments/payment-backend.js";

export async function POST(request) {
  // Chave de habilitacao, mesma origem e rate limit ficam em openChargeRequest,
  // compartilhado com cartao e boleto: regra de seguranca em tres copias vira
  // regra que falta em uma delas.
  const opened = await openChargeRequest(request);

  if (opened.response) {
    return opened.response;
  }

  const { orderId, supabase } = opened;

  try {
    const { amountCents, order, payment } = await loadChargeableOrder(orderId, supabase);

    const charge = await createPixCharge({
      amountCents,
      description: `Pedido ${orderId}`,
      externalReference: orderId,
      // Chave derivada do pedido: retry de rede nao gera segunda cobranca.
      idempotencyKey: `tszr15-pix-${orderId}`,
      payerEmail: order.customer_email
    });

    // A cobranca ja existe no provedor: o cliente pode pagar o QR mesmo que a
    // gravacao aqui falhe. `finalizeCharge` registra a orfa em vez de lancar.
    const escrituracao = await finalizeCharge({
      charge,
      methodId: "pix",
      orderId,
      paymentId: payment.id,
      supabase
    });

    logServerEvent("info", "payment_charge_created", {
      amountCents,
      escriturada: escrituracao.escriturada,
      orderId,
      providerPaymentId: charge.providerPaymentId
    });

    // O cliente recebe so o necessario para pagar. Taxa, custo e margem nunca
    // saem daqui.
    return Response.json({
      amountCents,
      expiresAt: charge.expiresAt,
      qrCode: charge.qrCode,
      qrCodeBase64: charge.qrCodeBase64,
      status: charge.status,
      ticketUrl: charge.ticketUrl
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
          : "Nao foi possivel gerar a cobranca.",
        error.retryable ? 503 : 502
      );
    }

    captureServerError(error, { route: "payment-pix" });

    return paymentErrorResponse("Nao foi possivel gerar a cobranca.", 500);
  }
}
