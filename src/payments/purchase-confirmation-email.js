import "server-only";

import { logServerEvent } from "../lib/logger.js";

// Separado da orquestração pelo mesmo motivo de `supplier-automation-email.js`:
// o marcador `server-only` impede o módulo de ser puxado para um componente de
// cliente, mas também impede que os testes importem quem depende dele. A
// decisão de QUANDO avisar fica em `purchase-confirmation.js`, testável; o
// envio fica aqui.

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/**
 * Avisa o cliente de que o pedido foi comprado na origem.
 *
 * O texto vai SEM nome de loja, SEM número do pedido na origem e SEM código de
 * rastreio: o cliente não precisa saber de onde veio o produto, e revelar isso
 * entrega o fornecedor de graça.
 *
 * Falha de envio é registrada e devolvida, nunca lançada: perder o aviso é um
 * incômodo; derrubar a operação do admin por causa dele seria o estrago.
 */
export async function sendPurchaseConfirmedEmail({ order }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  const email = order?.customer_email?.trim() || order?.customer_snapshot?.email?.trim();

  if (!apiKey || !from || !email) {
    return { enviado: false, motivo: "nao-configurado" };
  }

  try {
    const { Resend } = await import("resend");
    const resend = new Resend(apiKey);
    const numero = escapeHtml(order.order_number ?? "");
    const primeiroNome = escapeHtml(order.customer_name?.split(" ")[0] || "Tudo certo");

    const { error } = await resend.emails.send({
      from,
      html:
        `<h1>${primeiroNome}, seu pedido foi confirmado</h1>` +
        `<p>O pedido <strong>${numero}</strong> foi separado e ja esta em preparacao.</p>` +
        `<p>Voce recebe um novo aviso quando ele for postado. Para acompanhar, use a ` +
        `pagina de rastreio da loja com o numero do pedido.</p>`,
      subject: `Pedido ${numero} confirmado`,
      to: [email]
    });

    if (error) {
      throw new Error(error.message);
    }

    return { enviado: true };
  } catch (error) {
    logServerEvent("warn", "confirmacao_cliente_email_falhou", {
      motivo: String(error?.message ?? error).slice(0, 200),
      orderNumber: order?.order_number
    });

    return { enviado: false, motivo: "falha-no-envio" };
  }
}
