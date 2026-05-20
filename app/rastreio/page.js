import { SiteHeader } from "@/src/components/site-header.js";
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
    return "Nao informado";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(value));
}

function TrackingResult({ result }) {
  if (result.status === "setup-required") {
    return (
      <section className="tracking-result-panel">
        <p className="section-label">Rastreio indisponivel</p>
        <h2>Configure o Supabase server-side para consultar pedidos.</h2>
        {result.message ? <p className="helper-text">{result.message}</p> : null}
      </section>
    );
  }

  if (result.status === "not-found") {
    return (
      <section className="tracking-result-panel">
        <p className="section-label">Nao encontrado</p>
        <h2>Pedido nao localizado para os dados informados.</h2>
        <p className="helper-text">Confira o numero do pedido e o WhatsApp usado na compra.</p>
      </section>
    );
  }

  if (result.status !== "found") {
    return null;
  }

  const { order, timeline } = result;

  return (
    <section className="tracking-result-panel">
      <div className="tracking-result-header">
        <div>
          <p className="section-label">Pedido {order.orderNumber}</p>
          <h2>{order.operationalStatusLabel}</h2>
          <p>
            {order.customerName} - criado em {formatDateTime(order.createdAt)}
          </p>
        </div>
        <div className="admin-total-box">
          <span>Total</span>
          <strong>{formatCurrency(order.totalCents)}</strong>
        </div>
      </div>

      <div className="tracking-status-grid">
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
          <strong>{order.tracking.trackingCode || "Nao liberado"}</strong>
        </div>
        <div>
          <span>Prazo</span>
          <strong>{order.tracking.sourceEta || order.shippingEta || "A confirmar"}</strong>
        </div>
      </div>

      <div className="tracking-progress">
        {timeline.steps.map((step) => (
          <div
            className={`tracking-step ${step.isDone ? "is-done" : ""} ${
              step.isActive ? "is-active" : ""
            }`}
            key={step.id}
          >
            <span />
            <strong>{step.label}</strong>
          </div>
        ))}
      </div>

      <div className="tracking-content-grid">
        <div className="admin-section">
          <h3>Itens</h3>
          <div className="admin-item-list">
            {order.items.map((item) => (
              <div className="admin-item-row" key={`${item.product_name}-${item.variation}`}>
                <span>
                  <strong>{item.product_name}</strong>
                  <em>{item.variation}</em>
                </span>
                <span>{item.quantity}x</span>
              </div>
            ))}
          </div>
        </div>

        <div className="admin-section">
          <h3>Eventos</h3>
          <div className="tracking-event-list">
            {timeline.events.length === 0 ? (
              <p className="helper-text">O primeiro evento aparece quando a operacao liberar o rastreio.</p>
            ) : (
              timeline.events.map((event) => (
                <div className="tracking-event-row" key={event.id}>
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
      result = await findPublicOrderTracking({ contact, orderNumber });
    } catch (error) {
      result = {
        message: error.message,
        status: "setup-required"
      };
    }
  }

  return (
    <main className="page-shell auth-page tracking-page">
      <SiteHeader user={snapshot.user} />

      <section className="tracking-layout">
        <form className="auth-card tracking-lookup-card" method="GET">
          <p className="section-label">Rastreio TSZR15</p>
          <h1>Acompanhe seu pedido.</h1>
          <p className="helper-text">Use o numero gerado no checkout e o WhatsApp da compra.</p>

          <label>
            <span>Numero do pedido</span>
            <input defaultValue={orderNumber} name="pedido" placeholder="TSZ-..." required />
          </label>

          <label>
            <span>WhatsApp ou CPF/CNPJ</span>
            <input defaultValue={contact} name="contato" required />
          </label>

          <button className="button button-primary" type="submit">
            Consultar rastreio
          </button>
        </form>

        <TrackingResult result={result} />
      </section>
    </main>
  );
}
