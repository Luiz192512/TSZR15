import Link from "next/link";
import { redirect } from "next/navigation";

import {
  adminSignOutAction,
  updateAdminOrderAction
} from "@/app/admin/actions.js";
import { isAdminSessionValid, isAdminTokenConfigured } from "@/src/admin/admin-auth.js";
import { getAdminDashboardState } from "@/src/admin/order-admin.js";
import { getPublicSupabaseConfig } from "@/src/lib/supabase/config.js";
import {
  getStatusLabel,
  operationalStatuses,
  paymentStatuses,
  supplierChannels,
  supplierSourceStatuses
} from "@/src/orders/status.js";
import { SiteHeader } from "@/src/components/site-header.js";

export const metadata = {
  robots: {
    index: false,
    follow: false
  },
  title: "Admin | TSZR15"
};

function formatCurrency(cents, currency = "BRL") {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency
  }).format((cents ?? 0) / 100);
}

function formatDateTime(value) {
  if (!value) {
    return "Nao informado";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(value));
}

function centsToInput(cents) {
  if (!Number.isInteger(cents)) {
    return "";
  }

  return String((cents / 100).toFixed(2)).replace(".", ",");
}

function dateTimeToInput(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toISOString().slice(0, 16);
}

function getMessage(params) {
  if (params?.status === "salvo") {
    return "Pedido atualizado.";
  }

  return params?.error ? decodeURIComponent(params.error) : "";
}

function StatusSelect({ items, name, value }) {
  return (
    <select defaultValue={value ?? ""} name={name}>
      {items.map((item) => (
        <option key={item.id} value={item.id}>
          {item.label}
        </option>
      ))}
    </select>
  );
}

function AdminSetup({ message, mode = "env" }) {
  const config = getPublicSupabaseConfig();
  const projectRef = config.projectRef || "SEU_PROJECT_REF";
  const isDatabaseIssue = mode === "database";

  return (
    <main className="page-shell auth-page">
      <SiteHeader />
      <section className="setup-panel">
        <p className="section-label">{isDatabaseIssue ? "Banco pendente" : "Configuracao pendente"}</p>
        <h1>{isDatabaseIssue ? "Aplique a migration do Supabase." : "Ative o painel administrativo."}</h1>
        {isDatabaseIssue ? (
          <>
            <p>
              O token do admin esta aceito e o Supabase respondeu, mas as tabelas do painel ainda
              nao existem no projeto conectado.
            </p>
            <pre className="setup-command-block">
{`npx supabase login
npx supabase link --project-ref ${projectRef}
npx supabase db push`}
            </pre>
            <p>
              Se preferir, abra o SQL Editor no Supabase e execute
              `supabase/migrations/20260520_customer_accounts.sql`.
            </p>
          </>
        ) : (
          <p>
            Configure `TSZR15_ADMIN_TOKEN`, `NEXT_PUBLIC_SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`
            no ambiente do servidor.
          </p>
        )}
        {message ? <p className="form-alert">{message}</p> : null}
      </section>
    </main>
  );
}

function OrdersList({ orders, selectedOrderNumber }) {
  return (
    <aside className="admin-list-panel">
      <div className="admin-panel-heading">
        <p className="section-label">Fila</p>
        <strong>{orders.length} pedidos recentes</strong>
      </div>

      <div className="admin-order-list">
        {orders.length === 0 ? (
          <p className="helper-text">Nenhum pedido salvo ainda.</p>
        ) : (
          orders.map((order) => (
            <Link
              className={`admin-order-link ${
                selectedOrderNumber === order.order_number ? "is-active" : ""
              }`}
              href={`/admin?pedido=${encodeURIComponent(order.order_number)}`}
              key={order.id}
            >
              <span>
                <strong>{order.order_number}</strong>
                <em>{order.customer_name}</em>
              </span>
              <span>
                {formatCurrency(order.total_cents, order.currency)}
                <small>{getStatusLabel(order.operational_status, operationalStatuses)}</small>
              </span>
            </Link>
          ))
        )}
      </div>
    </aside>
  );
}

function OrderDetail({ selected }) {
  if (!selected) {
    return (
      <section className="admin-detail-panel">
        <p className="section-label">Pedido</p>
        <h1>Nenhum pedido selecionado.</h1>
      </section>
    );
  }

  const { items, order, payments, supplierPurchase, trackingEvents } = selected;

  return (
    <section className="admin-detail-panel">
      <div className="admin-detail-header">
        <div>
          <p className="section-label">Pedido interno</p>
          <h1>{order.order_number}</h1>
          <p>
            {order.customer_name} - {order.customer_whatsapp || order.customer_phone || "sem contato"}
          </p>
        </div>
        <div className="admin-total-box">
          <span>Total cobrado</span>
          <strong>{formatCurrency(order.total_cents, order.currency)}</strong>
        </div>
      </div>

      <div className="admin-status-grid">
        <div>
          <span>Pagamento</span>
          <strong>{getStatusLabel(order.payment_status, paymentStatuses)}</strong>
        </div>
        <div>
          <span>Operacao</span>
          <strong>{getStatusLabel(order.operational_status, operationalStatuses)}</strong>
        </div>
        <div>
          <span>Criado em</span>
          <strong>{formatDateTime(order.created_at)}</strong>
        </div>
      </div>

      <div className="admin-content-grid">
        <div className="admin-section">
          <h2>Itens</h2>
          <div className="admin-item-list">
            {items.map((item) => (
              <div className="admin-item-row" key={item.id}>
                <span>
                  <strong>{item.product_name}</strong>
                  <em>{item.variation}</em>
                </span>
                <span>
                  {item.quantity}x - {formatCurrency(item.subtotal_cents, item.currency)}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="admin-section">
          <h2>Cliente e entrega</h2>
          <dl className="admin-definition-list">
            <div>
              <dt>Email</dt>
              <dd>{order.customer_email || "Nao informado"}</dd>
            </div>
            <div>
              <dt>CPF/CNPJ</dt>
              <dd>{order.customer_tax_id || "Nao informado"}</dd>
            </div>
            <div>
              <dt>Entrega</dt>
              <dd>{order.address_snapshot?.line || "Nao informado"}</dd>
            </div>
          </dl>
        </div>
      </div>

      <form action={updateAdminOrderAction} className="admin-operation-form">
        <input name="orderId" type="hidden" value={order.id} />
        <input name="orderNumber" type="hidden" value={order.order_number} />
        <input name="supplierPurchaseId" type="hidden" value={supplierPurchase?.id ?? ""} />

        <div className="admin-form-block">
          <h2>Status do pedido</h2>
          <div className="form-grid">
            <label>
              <span>Status de pagamento</span>
              <StatusSelect items={paymentStatuses} name="paymentStatus" value={order.payment_status} />
            </label>
            <label>
              <span>Status operacional</span>
              <StatusSelect
                items={operationalStatuses}
                name="operationalStatus"
                value={order.operational_status}
              />
            </label>
            <label>
              <span>Operador</span>
              <input defaultValue={order.assigned_operator ?? ""} name="assignedOperator" />
            </label>
            <label>
              <span>Provedor pagamento</span>
              <input defaultValue={payments[0]?.provider ?? "manual"} name="paymentProvider" />
            </label>
            <label className="span-all">
              <span>Referencia do pagamento</span>
              <input defaultValue={payments[0]?.provider_reference ?? ""} name="paymentReference" />
            </label>
            <label className="span-all">
              <span>Observacoes internas do pedido</span>
              <textarea defaultValue={order.internal_notes ?? ""} name="orderInternalNotes" rows={3} />
            </label>
          </div>
        </div>

        <div className="admin-form-block">
          <h2>Origem interna e rastreio</h2>
          <div className="form-grid">
            <label>
              <span>Canal interno</span>
              <StatusSelect
                items={supplierChannels}
                name="internalChannel"
                value={supplierPurchase?.internal_channel ?? ""}
              />
            </label>
            <label>
              <span>Status da origem</span>
              <StatusSelect
                items={supplierSourceStatuses}
                name="sourceStatus"
                value={supplierPurchase?.source_status ?? "nao_comprado"}
              />
            </label>
            <label>
              <span>Loja/vendedor origem</span>
              <input defaultValue={supplierPurchase?.source_store_name ?? ""} name="sourceStoreName" />
            </label>
            <label>
              <span>Pedido na origem</span>
              <input defaultValue={supplierPurchase?.source_order_number ?? ""} name="sourceOrderNumber" />
            </label>
            <label className="span-all">
              <span>Link interno do produto</span>
              <input defaultValue={supplierPurchase?.source_product_url ?? ""} name="sourceProductUrl" />
            </label>
            <label>
              <span>Conta operacional</span>
              <input defaultValue={supplierPurchase?.operational_account ?? ""} name="operationalAccount" />
            </label>
            <label>
              <span>Comprado em</span>
              <input
                defaultValue={dateTimeToInput(supplierPurchase?.purchased_at)}
                name="purchasedAt"
                type="datetime-local"
              />
            </label>
            <label>
              <span>Custo produto</span>
              <input defaultValue={centsToInput(supplierPurchase?.product_cost_cents)} name="productCost" />
            </label>
            <label>
              <span>Custo frete</span>
              <input defaultValue={centsToInput(supplierPurchase?.shipping_cost_cents)} name="shippingCost" />
            </label>
            <label>
              <span>Moeda</span>
              <input defaultValue={supplierPurchase?.currency ?? "BRL"} name="supplierCurrency" />
            </label>
            <label>
              <span>Cotacao</span>
              <input defaultValue={supplierPurchase?.exchange_rate ?? ""} name="exchangeRate" />
            </label>
            <label>
              <span>Prazo origem</span>
              <input defaultValue={supplierPurchase?.source_eta ?? ""} name="sourceEta" />
            </label>
            <label>
              <span>Transportadora</span>
              <input defaultValue={supplierPurchase?.carrier ?? ""} name="carrier" />
            </label>
            <label>
              <span>Codigo de rastreio</span>
              <input defaultValue={supplierPurchase?.tracking_code ?? ""} name="trackingCode" />
            </label>
            <label>
              <span>Comprovante</span>
              <input defaultValue={supplierPurchase?.proof_url ?? ""} name="proofUrl" />
            </label>
            <label className="span-all">
              <span>Notas da origem</span>
              <textarea defaultValue={supplierPurchase?.internal_notes ?? ""} name="supplierNotes" rows={3} />
            </label>
          </div>
        </div>

        <div className="admin-form-block">
          <h2>Novo evento de rastreio</h2>
          <div className="form-grid">
            <label>
              <span>Status do evento</span>
              <input name="trackingStatus" placeholder="em_transito" />
            </label>
            <label>
              <span>Data do evento</span>
              <input name="trackingEventAt" type="datetime-local" />
            </label>
            <label>
              <span>Local</span>
              <input name="trackingLocation" />
            </label>
            <label className="span-all">
              <span>Descricao publica</span>
              <textarea name="trackingDescription" rows={3} />
            </label>
          </div>
        </div>

        <button className="button button-primary" type="submit">
          Salvar operacao
        </button>
      </form>

      <div className="admin-section">
        <h2>Eventos registrados</h2>
        <div className="tracking-event-list">
          {trackingEvents.length === 0 ? (
            <p className="helper-text">Nenhum evento de rastreio registrado.</p>
          ) : (
            trackingEvents.map((event) => (
              <div className="tracking-event-row" key={event.id}>
                <strong>{getStatusLabel(event.event_status, operationalStatuses)}</strong>
                <span>{formatDateTime(event.event_at ?? event.created_at)}</span>
                <p>{event.description || "Sem descricao."}</p>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}

export default async function AdminPage({ searchParams }) {
  const params = await searchParams;
  const message = getMessage(params);

  if (!isAdminTokenConfigured()) {
    return <AdminSetup message={message} />;
  }

  if (!(await isAdminSessionValid())) {
    redirect("/entrar?next=/admin");
  }

  let state;

  try {
    state = await getAdminDashboardState({ selectedOrderNumber: params?.pedido });
  } catch (error) {
    return (
      <AdminSetup
        mode="database"
        message={`Supabase conectado, mas a estrutura do banco ainda nao esta pronta: ${error.message}. Rode a migration antes de usar o painel.`}
      />
    );
  }

  if (!state.isConfigured) {
    return <AdminSetup message={message} />;
  }

  return (
    <main className="page-shell auth-page admin-page">
      <SiteHeader />

      <section className="admin-toolbar">
        <div>
          <p className="section-label">Painel admin</p>
          <h1>Operacao manual TSZR15.</h1>
        </div>
        <form action={adminSignOutAction}>
          <button className="button button-secondary" type="submit">
            Sair
          </button>
        </form>
      </section>

      {message ? <p className="form-alert admin-message">{message}</p> : null}

      <section className="admin-shell">
        <OrdersList
          orders={state.orders}
          selectedOrderNumber={state.selected?.order?.order_number ?? ""}
        />
        <OrderDetail selected={state.selected} />
      </section>
    </main>
  );
}
