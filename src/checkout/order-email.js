import "server-only";

import { formatCurrency } from "./whatsapp.js";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export async function sendOrderConfirmation({ draft, order }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  const email = draft.customerSnapshot?.email?.trim();

  if (!apiKey || !from || !email || !order?.orderNumber) {
    return { reason: "not-configured-or-no-email", sent: false };
  }

  const { Resend } = await import("resend");
  const resend = new Resend(apiKey);
  const customerName = escapeHtml(draft.customerSnapshot.name || "cliente");
  const items = draft.cartItems
    .map(
      (item) =>
        `<li>${item.quantity}x ${escapeHtml(item.name)} — ${escapeHtml(item.variation)}</li>`
    )
    .join("");
  const { error } = await resend.emails.send({
    from,
    html: `<h1>Pedido ${escapeHtml(order.orderNumber)} recebido</h1><p>Olá, ${customerName}.</p><p>Recebemos seu pedido TSZR15 e vamos confirmar disponibilidade e entrega pelo WhatsApp.</p><ul>${items}</ul><p><strong>Total: ${escapeHtml(formatCurrency(draft.totals.totalCents))}</strong></p>`,
    subject: `Pedido ${order.orderNumber} recebido | TSZR15`,
    to: [email]
  });

  if (error) {
    throw new Error(error.message);
  }

  return { sent: true };
}
