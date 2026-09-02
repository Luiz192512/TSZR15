import { logServerEvent } from "@/src/lib/logger.js";
import { captureServerError } from "@/src/lib/monitoring.js";
import {
  finalizeCharge,
  loadChargeableOrder,
  openChargeRequest,
  paymentErrorResponse
} from "@/src/payments/charge-flow.js";
import { createBoletoPayment, PaymentProviderError } from "@/src/payments/mercadopago.js";
import { resolvePayerAddress } from "@/src/payments/payer-address.js";
import { PaymentBackendError } from "@/src/payments/payment-backend.js";

function apenasDigitos(value) {
  return String(value ?? "").replace(/\D/g, "");
}

export async function POST(request) {
  const opened = await openChargeRequest(request);

  if (opened.response) {
    return opened.response;
  }

  const { body, orderId, supabase } = opened;

  // O emissor exige CPF/CNPJ e nome para gerar o boleto.
  const documento = apenasDigitos(body?.taxId);
  const nome = String(body?.firstName ?? "").trim();
  const sobrenome = String(body?.lastName ?? "").trim();
  const email = String(body?.payerEmail ?? "").trim();

  if (documento.length !== 11 && documento.length !== 14) {
    return paymentErrorResponse("CPF ou CNPJ invalido.", 400);
  }

  if (!nome || !email) {
    return paymentErrorResponse("Nome e e-mail sao obrigatorios para boleto.", 400);
  }

  try {
    const { amountCents, order, payment } = await loadChargeableOrder(orderId, supabase);

    const charge = await createBoletoPayment({
      amountCents,
      description: `Pedido ${orderId}`,
      externalReference: orderId,
      idempotencyKey: `tszr15-boleto-${orderId}`,
      payer: {
        // Do PEDIDO, nunca da tela: a pagina de pagamento e aberta so com o id,
        // e mostrar o endereco ali entregaria o dado a quem tivesse o link.
        address: await resolvePayerAddress(order),
        email,
        firstName: nome,
        identification: {
          number: documento,
          type: documento.length === 11 ? "CPF" : "CNPJ"
        },
        lastName: sobrenome
      }
    });

    // O boleto ja existe no emissor e pode ser pago mesmo que a gravacao aqui
    // falhe. `finalizeCharge` registra a orfa em vez de lancar.
    const escrituracao = await finalizeCharge({
      charge,
      methodId: "boleto",
      orderId,
      paymentId: payment.id,
      supabase
    });

    logServerEvent("info", "payment_boleto_charge", {
      escriturada: escrituracao.escriturada,
      expiresAt: charge.expiresAt,
      orderId,
      status: charge.status
    });

    // Boleto fica dias em aberto: o pedido segue como aguardando pagamento e
    // NAO entra na automacao de compra ate o webhook confirmar a compensacao.
    //
    // E boleto sem linha digitavel nem link nao e boleto: o emissor recusou ou
    // devolveu algo incompleto. Mostrar "gerado" com o campo vazio faria o
    // cliente esperar por uma cobranca que nunca vai compensar.
    const emitido = Boolean(charge.barcode || charge.ticketUrl);

    if (!emitido) {
      logServerEvent("warn", "payment_boleto_nao_emitido", {
        orderId,
        status: charge.status,
        statusDetail: charge.statusDetail
      });

      return paymentErrorResponse(
        "O emissor nao gerou o boleto. Confira o CPF e o endereco do pedido, ou pague por Pix.",
        409
      );
    }

    return Response.json({
      amountCents,
      barcode: charge.barcode,
      expiresAt: charge.expiresAt,
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
          : "Nao foi possivel gerar o boleto.",
        error.retryable ? 503 : 502
      );
    }

    captureServerError(error, { route: "payment-boleto" });

    return paymentErrorResponse("Nao foi possivel gerar o boleto.", 500);
  }
}
