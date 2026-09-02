import { notFound } from "next/navigation";
import nextDynamic from "next/dynamic";

import globalStyles from "@/app/storefront.module.css";
import { cx } from "@/src/lib/classnames";
import { createServiceRoleSupabaseClient } from "@/src/lib/supabase/admin.js";
import { getPaymentPublicKey, isOnlinePaymentEnabled } from "@/src/payments/payment-config.js";
import { isPaymentLinkExpired, PAYMENT_LINK_TTL_DAYS } from "@/src/payments/payment-link.js";

const PaymentExperience = nextDynamic(() =>
  import("@/src/components/payment/payment-experience.js").then(
    (module) => module.PaymentExperience
  )
);

const whatsappNumber = process.env.NEXT_PUBLIC_WHATSAPP_BUSINESS_NUMBER ?? "";

const ORDER_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const metadata = {
  description: "Pague seu pedido por Pix, cartao ou boleto.",
  // O id do pedido e a credencial desta pagina. `robots.txt` ja bloqueia
  // /pedido, mas ele e conselho: a meta tag vale mesmo para um link que o
  // cliente colou em algum lugar publico.
  robots: { follow: false, index: false },
  title: "Pagamento | TSZR15"
};

// Status de pagamento muda por webhook. Servir esta pagina de cache mostraria
// "aguardando" para um pedido que ja foi pago.
export const dynamic = "force-dynamic";

export default async function PaymentPage({ params }) {
  const { orderId } = await params;

  if (!isOnlinePaymentEnabled() || !ORDER_ID_PATTERN.test(orderId ?? "")) {
    notFound();
  }

  const supabase = createServiceRoleSupabaseClient();

  if (!supabase) {
    notFound();
  }

  // O id do pedido E a credencial desta pagina: e um UUID v4, entregue so a
  // quem acabou de fechar o carrinho. Mesma regra da rota de status — e por
  // isso que daqui so sai o que o proprio cliente ja sabe. Nome, endereco,
  // e-mail, taxa e custo ficam de fora.
  const { data: order } = await supabase
    .from("orders")
    .select("id, order_number, total_cents, payment_status, created_at")
    .eq("id", orderId)
    .maybeSingle();

  if (!order) {
    notFound();
  }

  // Link vencido nao e "pagina nao encontrada": o pedido existe, o link e que
  // caducou. Devolver 404 mudo deixaria o cliente achando que perdeu a compra —
  // ele precisa saber o numero do pedido e por onde continuar.
  if (isPaymentLinkExpired(order)) {
    return (
      <main className={cx(globalStyles, "page-shell")}>
        <section className={cx(globalStyles, "auth-card")}>
          <p className={cx(globalStyles, "section-label")}>Pedido {order.order_number}</p>
          <h1>Este link de pagamento venceu.</h1>
          <p className={cx(globalStyles, "helper-text")}>
            O link vale {PAYMENT_LINK_TTL_DAYS} dias depois que o pedido e criado. O seu pedido
            continua registrado — fale com o atendimento para receber um link novo.
          </p>
          <a
            className={cx(globalStyles, "button button-success")}
            href={`https://wa.me/${whatsappNumber}?text=${encodeURIComponent(
              `Olá! O link de pagamento do pedido ${order.order_number} venceu. Pode gerar outro?`
            )}`}
            rel="noreferrer noopener"
            target="_blank"
          >
            Falar no WhatsApp
          </a>
        </section>
      </main>
    );
  }

  return (
    <main className={cx(globalStyles, "page-shell")}>
      <PaymentExperience
        amountCents={order.total_cents ?? 0}
        initialStatus={order.payment_status}
        orderId={order.id}
        orderNumber={order.order_number}
        publicKey={getPaymentPublicKey()}
      />
    </main>
  );
}
