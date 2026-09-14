import { logServerEvent } from "@/src/lib/logger.js";
import { captureServerError } from "@/src/lib/monitoring.js";
import {
  finalizeCharge,
  loadChargeableOrder,
  openChargeRequest,
  paymentErrorResponse
} from "@/src/payments/charge-flow.js";
import { createPixCharge, PaymentProviderError } from "@/src/payments/mercadopago.js";
import { resolvePayerAddress } from "@/src/payments/payer-address.js";
import { buildAdditionalInfo, buildPayerFromOrder } from "@/src/payments/provider-payload.js";
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
    const { amountCents, items, order, payment } = await loadChargeableOrder(orderId, supabase);

    // Do PEDIDO, nunca do corpo da requisicao: a pagina de pagamento abre so
    // com o id, entao aceitar identidade do cliente deixaria qualquer um
    // associar a cobranca de um pedido alheio aos proprios dados.
    const address = await resolvePayerAddress(order);

    const charge = await createPixCharge({
      additionalInfo: buildAdditionalInfo({ address, items, order }),
      amountCents,
      description: `Pedido ${orderId}`,
      externalReference: orderId,
      // Chave derivada do pedido: retry de rede nao gera segunda cobranca.
      idempotencyKey: `tszr15-pix-${orderId}`,
      payer: buildPayerFromOrder(order, address),
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
      // Falha do lado da loja precisa de rastro. Sem isto o cliente via o erro e
      // o log nao guardava nada.
      if (error.status >= 500) {
        logServerEvent("error", "payment_backend_failed", {
          causaBanco: error.causaBanco,
          status: error.status
        });
      }

      return paymentErrorResponse(error.message, error.status);
    }

    if (error instanceof PaymentProviderError) {
      logServerEvent("error", "payment_provider_failed", {
        causasProvedor: error.causasProvedor,
        motivoProvedor: error.motivoProvedor,
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
