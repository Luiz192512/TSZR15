"use client";

import { useActionState } from "react";

import globalStyles from "@/app/storefront.module.css";
import { lookupOrderTracking } from "@/app/rastreio/actions.js";
import { cx } from "@/src/lib/classnames";
import { formatBrasiliaDateTime } from "@/src/lib/brasilia-date.js";

const emptyTrackingState = { status: "empty" };

function formatCurrency(cents) {
  return new Intl.NumberFormat("pt-BR", {
    currency: "BRL",
    style: "currency"
  }).format((Number(cents) || 0) / 100);
}

function formatDateTime(value) {
  if (!value) {
    return "Nao informado";
  }

  return formatBrasiliaDateTime(value);
}

function TrackingResult({ result }) {
  if (result.status === "rate-limited") {
    return (
      <section className={cx(globalStyles, "tracking-result-panel")}>
        <p className={cx(globalStyles, "section-label")}>Aguarde para consultar novamente</p>
        <h2>Limite de consultas atingido.</h2>
        <p className={cx(globalStyles, "helper-text")}>{result.message}</p>
      </section>
    );
  }

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
        <p className={cx(globalStyles, "section-label")}>Nao encontrado</p>
        <h2>Pedido nao localizado para os dados informados.</h2>
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
          <strong>{order.tracking.trackingCode || "Nao liberado"}</strong>
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

export function TrackingLookup() {
  const [result, formAction, isPending] = useActionState(lookupOrderTracking, emptyTrackingState);

  return (
    <section className={cx(globalStyles, "tracking-layout")}>
      <form action={formAction} className={cx(globalStyles, "auth-card tracking-lookup-card")}>
        <p className={cx(globalStyles, "section-label")}>Rastreio TSZR15</p>
        <h1>Acompanhe seu pedido.</h1>
        <p className={cx(globalStyles, "helper-text")}>
          Use o numero gerado no checkout e o WhatsApp da compra.
        </p>

        <label>
          <span>Numero do pedido</span>
          <input name="pedido" placeholder="TSZ-..." required />
        </label>

        <label>
          <span>WhatsApp ou CPF/CNPJ</span>
          <input name="contato" required />
        </label>

        <button
          className={cx(globalStyles, "button button-primary")}
          disabled={isPending}
          type="submit"
        >
          {isPending ? "Consultando..." : "Consultar rastreio"}
        </button>
      </form>

      <TrackingResult result={result} />
    </section>
  );
}
