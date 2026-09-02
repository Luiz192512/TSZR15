const DIA_MS = 24 * 60 * 60 * 1000;

/**
 * Por quanto tempo o link de pagamento vale.
 *
 * O boleto leva até 3 dias úteis para compensar, então a janela precisa ser
 * confortavelmente maior que isso — um link que morre antes do banco confirmar
 * transformaria uma compra legítima em suporte.
 */
export const PAYMENT_LINK_TTL_DAYS = 7;

const STATUS_PAGO = "pagamento_confirmado";

/**
 * O link de pagamento expirou?
 *
 * O `orderId` é a única credencial da página, e um UUID v4 não é adivinhável —
 * mas ele também não caduca sozinho. Sem prazo, um link que vazou (histórico do
 * navegador, print em grupo, e-mail encaminhado) continua abrindo a cobrança
 * para sempre. O prazo não impede um vazamento; ele fecha a janela.
 *
 * **Pedido pago nunca expira.** O cliente que já pagou tem direito de voltar e
 * ver a confirmação, e ali não há mais cobrança a criar.
 */
export function isPaymentLinkExpired(order, { now = Date.now() } = {}) {
  if (!order || order.payment_status === STATUS_PAGO) {
    return false;
  }

  const criadoEm = Date.parse(order.created_at ?? "");

  // `orders.created_at` é NOT NULL DEFAULT now(), então isto não acontece com
  // dado íntegro. Se acontecer, não caducar é o lado certo de errar: recusar a
  // cobrança de um pedido legítimo custa mais do que manter um link a mais.
  if (!Number.isFinite(criadoEm)) {
    return false;
  }

  return now - criadoEm > PAYMENT_LINK_TTL_DAYS * DIA_MS;
}
