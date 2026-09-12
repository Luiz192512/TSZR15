// Pix vencido que ninguem avisou que venceu.
//
// O provedor gera o Pix com validade (`date_of_expiration`, gravada em
// `payments.expires_at`) e deveria mandar um `payment.updated` quando ele cai.
// No sandbox esse aviso nunca chegou: dois Pix de teste venceram em 05/09 e
// 09/09, receberam so `payment.created` e seguiram "aguardando pagamento" no
// banco, no admin e na conta do cliente. Em producao o aviso nao foi
// verificado — e a loja nao pode depender de algo que nao verificou.
//
// A regra mora em dois lugares, de proposito, e um teste confere que concordam:
//   - aqui, para a rota de status, que por contrato so LE e nao pode gravar;
//   - em `expire_stale_pix_payments()` (migracao 20260910120000), que o
//     pg_cron roda a cada 10 minutos e grava o estado de verdade.
//
// So Pix. Boleto vence no dia, mas quem paga no ultimo dia compensa de um a
// tres dias uteis depois: marcar expirado no vencimento diria a um cliente que
// pagou que o pagamento dele nao vale. Cartao nao tem validade.

// Folga depois do vencimento. Um Pix pago no ultimo minuto chega por webhook
// segundos depois; sem folga, a tela declararia "expirado", pararia de consultar
// e o cliente que pagou nunca veria a confirmacao.
export const PIX_EXPIRY_GRACE_MS = 10 * 60 * 1000;

export function isStalePixCharge(payment, agora = Date.now()) {
  if (payment?.status !== "aguardando_pagamento" || payment?.payment_method_id !== "pix") {
    return false;
  }

  // Pagamento manual (fluxo de WhatsApp) nao tem validade: `expires_at` nulo
  // vira NaN aqui e nunca expira.
  const venceEm = Date.parse(payment?.expires_at ?? "");

  if (!Number.isFinite(venceEm)) {
    return false;
  }

  return agora - venceEm > PIX_EXPIRY_GRACE_MS;
}

export function resolveEffectivePaymentStatus(payment, agora = Date.now()) {
  return isStalePixCharge(payment, agora) ? "expirado" : payment?.status;
}
