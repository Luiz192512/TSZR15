import globalStyles from "@/src/styles/storefront-styles.js";
import { cx } from "@/src/lib/classnames";
import { SiteHeader } from "@/src/components/site-header.js";
import { TrackingLookupForm } from "@/src/components/tracking-lookup-form.js";
import { formatCurrency } from "@/src/catalog/index.js";
import { getCurrentCustomerSnapshot } from "@/src/customer/customer-data.js";
import { createServerSupabaseClient } from "@/src/lib/supabase/server.js";
import { findPublicOrderTracking } from "@/src/tracking/order-tracking.js";

export const metadata = {
  title: "Rastreio | TSZR15",
  description: "Acompanhamento de pedido TSZR15 por numero do pedido e contato."
};

function formatDateTime(value) {
  if (!value) {
    return "Não informado";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(value));
}

function TrackingResult({ result }) {
  if (result.status === "setup-required") {
    return (
      <section className={cx(globalStyles, "tracking-result-panel")}>
        <p className={cx(globalStyles, "section-label")}>Rastreio indisponivel</p>
        <h2>Configure o Supabase server-side para consultar pedidos.</h2>
        {result.message ? (
          <p className={cx(globalStyles, "helper-text")}>{result.message}</p>
        ) : null}
      </section>
    );
  }

  if (result.status === "not-found") {
    return (
      <section className={cx(globalStyles, "tracking-result-panel")}>
        <p className={cx(globalStyles, "section-label")}>Não encontrado</p>
        <h2>Pedido não localizado para os dados informados.</h2>
        <p className={cx(globalStyles, "helper-text")}>
          Confira o numero do pedido e o WhatsApp usado na compra.
        </p>
      </section>
    );
  }

  if (result.status !== "found") {
    return null;
  }

  const { order, timeline } = result;

  return (
    <section className={cx(globalStyles, "tracking-result-panel")}>
      <div className={cx(globalStyles, "tracking-result-header")}>
        <div>
          <p className={cx(globalStyles, "section-label")}>Pedido {order.orderNumber}</p>
          <h2>{order.operationalStatusLabel}</h2>
          <p>
            {order.customerName} - criado em {formatDateTime(order.createdAt)}
          </p>
        </div>
        <div className={cx(globalStyles, "admin-total-box")}>
          <span>Total</span>
          <strong>{formatCurrency(order.totalCents)}</strong>
        </div>
      </div>

      <div className={cx(globalStyles, "tracking-status-grid")}>
        <div>
          <span>Pagamento</span>
          <strong>{order.paymentStatusLabel}</strong>
        </div>
        <div>
          <span>Transportadora</span>
          <strong>{order.tracking.carrier || "Aguardando"}</strong>
        </div>
        <div>
          <span>Codigo</span>
          <strong>{order.tracking.trackingCode || "Não liberado"}</strong>
        </div>
        <div>
          <span>Prazo</span>
          <strong>{order.tracking.sourceEta || order.shippingEta || "A confirmar"}</strong>
        </div>
      </div>

      <div className={cx(globalStyles, "tracking-current-step")}>
        <span aria-hidden="true" />
        <div>
          <small>Status atual</small>
          <strong>{timeline.currentStep.label}</strong>
        </div>
      </div>

      <div className={cx(globalStyles, "tracking-content-grid")}>
        <div className={cx(globalStyles, "admin-section")}>
          <h3>Itens</h3>
          <div className={cx(globalStyles, "admin-item-list")}>
            {order.items.map((item) => (
              <div
                className={cx(globalStyles, "admin-item-row")}
                key={`${item.product_name}-${item.variation}`}
              >
                <span>
                  <strong>{item.product_name}</strong>
                  <em>{item.variation}</em>
                </span>
                <span>{item.quantity}x</span>
              </div>
            ))}
          </div>
        </div>

        <div className={cx(globalStyles, "admin-section")}>
          <h3>Eventos</h3>
          <div className={cx(globalStyles, "tracking-event-list")}>
            {timeline.events.length === 0 ? (
              <p className={cx(globalStyles, "helper-text")}>
                O primeiro evento aparece quando a operacao liberar o rastreio.
              </p>
            ) : (
              timeline.events.map((event) => (
                <div className={cx(globalStyles, "tracking-event-row")} key={event.id}>
                  <strong>{event.label}</strong>
                  <span>{formatDateTime(event.eventAt)}</span>
                  <p>{event.description || event.location || "Atualizacao registrada."}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

export default async function TrackingPage({ searchParams }) {
  const params = await searchParams;
  const orderNumber = params?.pedido ?? "";
  const contact = params?.contato ?? "";
  const hasLookup = Boolean(orderNumber || contact);
  const supabase = await createServerSupabaseClient();
  const snapshot = await getCurrentCustomerSnapshot(supabase);
  let result = { status: "empty" };

  if (hasLookup) {
    try {
      result = await findPublicOrderTracking({ contact, orderNumber, supabase: undefined });
    } catch (error) {
      result = {
        message: error.message,
        status: "setup-required"
      };
    }
  }

  return (
    <main className={cx(globalStyles, "page-shell auth-page tracking-page")}>
      <SiteHeader user={snapshot.user} />

      <section className={cx(globalStyles, "tracking-layout")}>
        <TrackingLookupForm contact={contact} orderNumber={orderNumber} />

        <TrackingResult result={result} />
      </section>
    </main>
  );
}
