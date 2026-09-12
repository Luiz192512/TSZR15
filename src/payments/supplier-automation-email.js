import "server-only";

import { logServerEvent } from "../lib/logger.js";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatCents(cents) {
  return new Intl.NumberFormat("pt-BR", { currency: "BRL", style: "currency" }).format(
    (cents ?? 0) / 100
  );
}

/**
 * Avisa o operador que existe compra a fazer.
 *
 * É o passo que fecha o ciclo: a automação não compra no fornecedor, então o
 * valor dela depende de alguém saber que há trabalho esperando.
 *
 * Falha de e-mail NÃO derruba a automação. O pagamento já foi confirmado e a
 * compra já está registrada no banco; perder o aviso é um incômodo, desfazer
 * tudo por causa dele seria um estrago.
 */
export async function notifyOperatorOfPendingPurchase({ order, painelUrl }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  const to = process.env.TSZR15_OPERATOR_EMAIL || from;

  if (!apiKey || !from || !to) {
    return { motivo: "nao-configurado", enviado: false };
  }

  try {
    const { Resend } = await import("resend");
    const resend = new Resend(apiKey);
    const numero = escapeHtml(order?.order_number ?? "");
    const cliente = escapeHtml(order?.customer_name ?? "cliente");
    const total = escapeHtml(formatCents(order?.total_cents));
    const link = painelUrl ? `<p><a href="${escapeHtml(painelUrl)}">Abrir no painel</a></p>` : "";

    const { error } = await resend.emails.send({
      from,
      html:
        `<h1>Pedido ${numero}: pagamento confirmado</h1>` +
        `<p>Cliente: ${cliente}<br>Total: <strong>${total}</strong></p>` +
        `<p>A compra no fornecedor está <strong>pendente</strong> e precisa ser feita por uma pessoa. ` +
        `O sistema já registrou a linha de compra e moveu o pedido para "compra interna pendente".</p>` +
        link,
      subject: `Comprar no fornecedor — pedido ${order?.order_number ?? ""}`,
      to: [to]
    });

    if (error) {
      throw new Error(error.message);
    }

    return { enviado: true };
  } catch (error) {
    // Registrado e engolido de propósito: ver o comentário acima.
    logServerEvent("warn", "automacao_email_operador_falhou", {
      motivo: String(error?.message ?? error).slice(0, 200),
      orderNumber: order?.order_number
    });

    return { motivo: "falha-no-envio", enviado: false };
  }
}
