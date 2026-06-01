import Link from "next/link";
import { redirect } from "next/navigation";

import {
  adminSignOutAction,
  archiveAdminCouponAction,
  archiveAdminProductAction,
  createAdminOrderAction,
  moderateOrderReviewAction,
  setAdminInternalOrderStatusAction,
  upsertAdminCouponAction,
  upsertAdminProductAction,
  updateAdminOrderAction
} from "@/app/admin/actions.js";
import { isAdminSessionValid, isAdminTokenConfigured } from "@/src/admin/admin-auth.js";
import { getAdminCatalogState } from "@/src/admin/catalog-admin.js";
import { getAdminDashboardState } from "@/src/admin/order-admin.js";
import { formatCategoryLabels } from "@/src/catalog/index.js";
import { getPublicSupabaseConfig } from "@/src/lib/supabase/config.js";
import {
  getEffectiveInternalOrderStatus,
  getStatusLabel,
  internalOrderStatuses,
  operationalStatuses,
  paymentStatuses,
  supplierChannels,
  supplierSourceStatuses
} from "@/src/orders/status.js";
import { paymentMethods, shippingOptions } from "@/src/checkout/whatsapp.js";
import { ProductImageUploader } from "@/src/components/admin/product-image-uploader.js";
import { SiteHeader } from "@/src/components/site-header.js";

export const metadata = {
  robots: {
    index: false,
    follow: false
  },
  title: "Admin | TSZR15"
};
export const revalidate = 600;

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

function arrayToTextarea(values) {
  return Array.isArray(values) ? values.join("\n") : "";
}

function productPriceToInput(cents) {
  return centsToInput(cents) || "";
}

function productCostToInput(cents) {
  return centsToInput(cents) || "";
}

function getActiveAdminTab(params) {
  if (params?.tab === "produtos" || params?.tab === "cupons" || params?.tab === "analise") {
    return params.tab;
  }

  return "pedidos";
}

function getNewProductCount(params) {
  const count = Number.parseInt(String(params?.novosProdutos ?? ""), 10);

  return Number.isInteger(count) && count > 0 ? Math.min(count, 12) : 0;
}

function buildAddProductHref({ newProductCount = 0, selectedProductId = "" } = {}) {
  const currentDraftCount = selectedProductId ? newProductCount : Math.max(newProductCount, 1);
  const nextDraftCount = Math.min(currentDraftCount + 1, 12);

  return `/admin?tab=produtos&novosProdutos=${nextDraftCount}`;
}

function getMessage(params) {
  if (params?.status === "salvo") {
    return "Pedido atualizado.";
  }

  if (params?.status === "pedido-confirmado") {
    return "Pedido interno confirmado.";
  }

  if (params?.status === "pedido-recusado") {
    return "Pedido interno recusado.";
  }

  if (params?.status === "pedido-criado") {
    return "Pedido criado no painel admin.";
  }

  if (params?.status === "produto-salvo") {
    return "Produto salvo no catalogo.";
  }

  if (params?.status === "produto-arquivado") {
    return "Produto arquivado da vitrine.";
  }

  if (params?.status === "cupom-salvo") {
    return "Cupom salvo.";
  }

  if (params?.status === "cupom-arquivado") {
    return "Cupom desativado.";
  }

  if (params?.status === "avaliacao-approved") {
    return "Avaliacao aprovada e liberada no produto.";
  }

  if (params?.status === "avaliacao-rejected") {
    return "Avaliacao recusada e mantida no historico interno.";
  }

  return typeof params?.error === "string" ? params.error : "";
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

function RequiredMark() {
  return <span className="required-field-mark" aria-hidden="true">*</span>;
}

function AdminTabs({ activeTab }) {
  return (
    <nav className="admin-tab-bar" aria-label="Secoes do painel admin">
      <Link className={activeTab === "pedidos" ? "is-active" : ""} href="/admin">
        Pedidos
      </Link>
      <Link
        className={activeTab === "produtos" ? "is-active" : ""}
        href="/admin?tab=produtos"
      >
        Produtos
      </Link>
      <Link
        className={activeTab === "analise" ? "is-active" : ""}
        href="/admin?tab=analise"
      >
        Analise
      </Link>
      <Link
        className={activeTab === "cupons" ? "is-active" : ""}
        href="/admin?tab=cupons"
      >
        Cupons
      </Link>
    </nav>
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
            Configure `TSZR15_ADMIN_TOKEN`, a URL do Supabase e uma chave privilegiada do Supabase
            no ambiente do servidor.
          </p>
        )}
        {message ? <p className="form-alert">{message}</p> : null}
      </section>
    </main>
  );
}

function getInternalOrderConfig(status) {
  const configs = {
    confirmado: {
      icon: "\u2713",
      label: getStatusLabel(status, internalOrderStatuses)
    },
    pendente: {
      icon: "!",
      label: getStatusLabel(status, internalOrderStatuses)
    },
    recusado: {
      icon: "X",
      label: getStatusLabel(status, internalOrderStatuses)
    }
  };

  return configs[status] ?? null;
}

function InternalOrderBadge({ status }) {
  const config = getInternalOrderConfig(status);

  if (!config) {
    return null;
  }

  return (
    <span className={`internal-order-badge is-${status}`}>
      <span aria-hidden="true">{config.icon}</span>
      {config.label}
    </span>
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
          orders.map((order) => {
            const internalStatus = getEffectiveInternalOrderStatus(order);

            return (
              <Link
                className={`admin-order-link ${
                  selectedOrderNumber === order.order_number ? "is-active" : ""
                } ${internalStatus ? `internal-order-${internalStatus}` : ""}`}
                href={`/admin?pedido=${encodeURIComponent(order.order_number)}`}
                key={order.id}
              >
                <span>
                  <strong>{order.order_number}</strong>
                  <em>{order.customer_name}</em>
                  <InternalOrderBadge status={internalStatus} />
                </span>
                <span>
                  {formatCurrency(order.total_cents, order.currency)}
                  <small>{getStatusLabel(order.operational_status, operationalStatuses)}</small>
                </span>
              </Link>
            );
          })
        )}
      </div>
    </aside>
  );
}

function NewOrderForm({ products }) {
  return (
    <section className="admin-detail-panel">
      <div className="admin-detail-header">
        <div>
          <p className="section-label">Novo pedido</p>
          <h1>Adicionar pedido.</h1>
          <p>Crie um pedido manual usando um produto publicado no catalogo.</p>
        </div>
      </div>

      {products.length === 0 ? (
        <p className="helper-text">
          Cadastre ou publique um produto antes de criar um pedido manual.
        </p>
      ) : (
        <form action={createAdminOrderAction} className="admin-operation-form">
          <div className="admin-form-block">
            <h2>Cliente</h2>
            <div className="form-grid">
              <label>
                <span>Nome</span>
                <input name="customerName" required />
              </label>
              <label>
                <span>WhatsApp</span>
                <input name="customerWhatsapp" placeholder="(11) 99999-9999" />
              </label>
              <label>
                <span>Telefone alternativo</span>
                <input name="customerPhone" />
              </label>
              <label>
                <span>Email</span>
                <input name="customerEmail" type="email" />
              </label>
              <label>
                <span>CPF/CNPJ</span>
                <input name="customerTaxId" />
              </label>
              <label>
                <span>CEP</span>
                <input name="customerCep" required />
              </label>
              <label className="span-all">
                <span>Endereco de entrega</span>
                <input name="customerAddress" required />
              </label>
              <label className="span-all">
                <span>Observacoes do cliente</span>
                <textarea name="customerNotes" rows={3} />
              </label>
            </div>
          </div>

          <div className="admin-form-block">
            <h2>Produto e pagamento</h2>
            <div className="form-grid">
              <label className="span-all">
                <span>Produto</span>
                <select name="productId" required>
                  <option value="">Selecione um produto</option>
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name} - {formatCurrency(product.priceCents, product.currency)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Variacao</span>
                <input name="variation" placeholder="deixe vazio para usar a primeira variacao" />
              </label>
              <label>
                <span>Quantidade</span>
                <input defaultValue="1" min="1" name="quantity" type="number" />
              </label>
              <label>
                <span>Pagamento</span>
                <StatusSelect items={paymentMethods} name="paymentMethodId" value="pix" />
              </label>
              <label>
                <span>Entrega</span>
                <StatusSelect items={shippingOptions} name="shippingOptionId" value="combinar" />
              </label>
              <label className="span-all">
                <span>Observacoes internas</span>
                <textarea name="orderInternalNotes" rows={3} />
              </label>
            </div>
          </div>

          <button className="button button-primary" type="submit">
            Criar pedido
          </button>
        </form>
      )}
    </section>
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
  const internalStatus = getEffectiveInternalOrderStatus(order);

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
        <div className={internalStatus ? `internal-order-${internalStatus}` : ""}>
          <span>Pedido interno</span>
          <strong>
            {internalStatus ? getStatusLabel(internalStatus, internalOrderStatuses) : "Sem decisao"}
          </strong>
          <InternalOrderBadge status={internalStatus} />
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
                  {Number.isInteger(item.subtotal_cost_cents) ? (
                    <em>
                      Custo: {formatCurrency(item.subtotal_cost_cents, item.currency)} - Lucro:
                      {" "}
                      {formatCurrency(
                        item.subtotal_cents - item.subtotal_cost_cents,
                        item.currency
                      )}
                    </em>
                  ) : null}
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

      <div className="admin-internal-decision">
        <div>
          <p className="section-label">Decisao final</p>
          <h2>Confirmar ou recusar pedido interno.</h2>
          <p>
            Confirmar libera o pedido para operacao interna. Recusar marca o pedido como recusado
            sem apagar historico.
          </p>
        </div>
        <div className="admin-internal-decision-actions">
          <form action={setAdminInternalOrderStatusAction}>
            <input name="orderId" type="hidden" value={order.id} />
            <input name="orderNumber" type="hidden" value={order.order_number} />
            <input name="internalOrderStatus" type="hidden" value="confirmado" />
            <button className="button button-success" type="submit">
              <span aria-hidden="true">{"\u2713"}</span>
              Confirmar pedido interno
            </button>
          </form>
          <form action={setAdminInternalOrderStatusAction}>
            <input name="orderId" type="hidden" value={order.id} />
            <input name="orderNumber" type="hidden" value={order.order_number} />
            <input name="internalOrderStatus" type="hidden" value="recusado" />
            <button className="button button-danger" type="submit">
              <span aria-hidden="true">X</span>
              Recusar pedido interno
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}

function MetricCard({ label, value, detail, tone = "" }) {
  return (
    <div className={`admin-metric-card ${tone ? `is-${tone}` : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {detail ? <small>{detail}</small> : null}
    </div>
  );
}

function ReviewStars({ rating = 0 }) {
  return (
    <span className="review-stars" aria-label={`${rating} de 5 estrelas`}>
      {Array.from({ length: 5 }).map((_, index) => (
        <span className={index < rating ? "is-filled" : ""} key={index}>
          {"\u2605"}
        </span>
      ))}
    </span>
  );
}

function PendingReviewCard({ review }) {
  return (
    <article className="admin-review-card">
      <div className="admin-review-head">
        <div>
          <strong>{review.productName}</strong>
          <span>Pedido {review.orderNumber || "sem numero"}</span>
        </div>
        <ReviewStars rating={review.rating} />
      </div>

      <p>{review.comment}</p>
      <small>
        {review.publicName} - {formatDateTime(review.createdAt)}
      </small>

      {review.photos?.length ? (
        <div className="admin-review-photo-row">
          {review.photos.map((photo) => (
            <img alt="" key={photo.id} src={photo.url} />
          ))}
        </div>
      ) : null}

      <div className="admin-review-actions">
        <form action={moderateOrderReviewAction}>
          <input name="reviewId" type="hidden" value={review.id} />
          <input name="reviewStatus" type="hidden" value="approved" />
          <button className="button button-success" type="submit">
            Aprovar
          </button>
        </form>
        <form action={moderateOrderReviewAction}>
          <input name="reviewId" type="hidden" value={review.id} />
          <input name="reviewStatus" type="hidden" value="rejected" />
          <input name="moderationNote" type="hidden" value="Conteudo recusado pela moderacao." />
          <button className="button button-danger" type="submit">
            Recusar
          </button>
        </form>
      </div>
    </article>
  );
}

function AdminAnalytics({ analytics, pendingReviews = [] }) {
  const statusCounts = analytics.internalStatusCounts ?? {};

  return (
    <section className="admin-analytics-shell">
      <div className="admin-metric-grid">
        <MetricCard
          detail={`${analytics.activeOrderCount} pedidos ativos`}
          label="Quantidade de vendas"
          value={analytics.salesCount}
        />
        <MetricCard
          detail={`${formatCurrency(analytics.knownCostCents)} em custos conhecidos`}
          label="Lucro estimado"
          tone={analytics.grossProfitCents >= 0 ? "positive" : "negative"}
          value={formatCurrency(analytics.grossProfitCents)}
        />
        <MetricCard
          detail={`${analytics.totalOrderCount} pedidos no historico`}
          label="Receita confirmada"
          value={formatCurrency(analytics.totalRevenueCents)}
        />
        <MetricCard
          detail="media dos pedidos confirmados"
          label="Ticket medio"
          value={formatCurrency(analytics.averageTicketCents)}
        />
      </div>

      <div className="admin-chart-grid">
        <section className="admin-section">
          <h2>Vendas dos ultimos 7 dias</h2>
          <div className="admin-bar-chart">
            {analytics.dailySales.map((day) => (
              <div className="admin-bar-row" key={day.key}>
                <span>{day.label}</span>
                <div>
                  <i style={{ width: `${Math.max(4, day.percentage)}%` }} />
                </div>
                <strong>{formatCurrency(day.totalCents)}</strong>
              </div>
            ))}
          </div>
        </section>

        <section className="admin-section">
          <h2>Usuarios que mais compraram</h2>
          <div className="admin-ranking-list">
            {analytics.topCustomers.length === 0 ? (
              <p className="helper-text">Ainda nao ha compras confirmadas para ranking.</p>
            ) : (
              analytics.topCustomers.map((customer, index) => (
                <div className="admin-ranking-row" key={customer.key}>
                  <span>{index + 1}</span>
                  <strong>{customer.name}</strong>
                  <small>
                    {customer.count} pedido(s) - {formatCurrency(customer.totalCents)}
                  </small>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="admin-section">
          <h2>Status interno</h2>
          <div className="admin-status-summary">
            <div className="internal-order-confirmado">
              <strong>{statusCounts.confirmado ?? 0}</strong>
              <span>Confirmados</span>
            </div>
            <div className="internal-order-pendente">
              <strong>{statusCounts.pendente ?? 0}</strong>
              <span>Pendentes</span>
            </div>
            <div className="internal-order-recusado">
              <strong>{statusCounts.recusado ?? 0}</strong>
              <span>Recusados</span>
            </div>
            <div>
              <strong>{statusCounts.novo ?? 0}</strong>
              <span>Novos sem decisao</span>
            </div>
          </div>
        </section>

        <section className="admin-section">
          <h2>Itens mais vendidos</h2>
          <div className="admin-ranking-list">
            {analytics.topSoldItems?.length ? (
              analytics.topSoldItems.map((item, index) => (
                <div className="admin-ranking-row" key={item.key}>
                  <span>{index + 1}</span>
                  <strong>{item.name}</strong>
                  <small>
                    {item.quantity} un. - {formatCurrency(item.totalCents)}
                  </small>
                </div>
              ))
            ) : (
              <p className="helper-text">Sem pedidos confirmados para ranking de produtos.</p>
            )}
          </div>
        </section>

        <section className="admin-section">
          <h2>Itens mais bem avaliados</h2>
          <div className="admin-ranking-list">
            {analytics.topRatedItems?.length ? (
              analytics.topRatedItems.map((item, index) => (
                <div className="admin-ranking-row" key={item.key}>
                  <span>{index + 1}</span>
                  <strong>{item.name}</strong>
                  <small>
                    {item.averageRating.toFixed(1)} estrelas - {item.reviewCount} avaliacao(oes)
                  </small>
                </div>
              ))
            ) : (
              <p className="helper-text">Sem avaliacoes aprovadas para ranking.</p>
            )}
          </div>
        </section>
      </div>

      <section className="admin-section admin-review-moderation">
        <div className="admin-panel-heading">
          <p className="section-label">Moderacao</p>
          <h2>Avaliacoes pendentes</h2>
        </div>
        {pendingReviews.length === 0 ? (
          <p className="helper-text">Nenhuma avaliacao aguardando aprovacao.</p>
        ) : (
          <div className="admin-review-grid">
            {pendingReviews.map((review) => (
              <PendingReviewCard key={review.id} review={review} />
            ))}
          </div>
        )}
      </section>
    </section>
  );
}

function ProductList({ newProductCount, products, selectedProductId }) {
  return (
    <aside className="admin-list-panel">
      <div className="admin-panel-heading">
        <p className="section-label">Catalogo</p>
        <strong>{products.length} produtos</strong>
      </div>

      <div className="admin-product-list">
        <Link
          className={`admin-product-link ${!selectedProductId ? "is-active" : ""}`}
          href={buildAddProductHref({ newProductCount, selectedProductId })}
        >
          <span>
            <strong>Adicionar produto</strong>
            <em>Criar outro card vazio</em>
          </span>
          <small>{selectedProductId ? "Novo" : `${Math.max(newProductCount, 1)} aberto(s)`}</small>
        </Link>

        {products.map((product) => (
          <Link
            className={`admin-product-link ${
              selectedProductId === product.id ? "is-active" : ""
            }`}
            href={`/admin?tab=produtos&produto=${encodeURIComponent(product.id)}`}
            key={product.id}
          >
            <span>
              <strong>{product.name}</strong>
              <em>{formatCategoryLabels(product.storefrontCategoryIds).join(", ")}</em>
            </span>
            <small>
              {product.isPublished ? "Publicado" : "Arquivado"}
              {Number.isInteger(product.profitCents)
                ? ` - lucro ${formatCurrency(product.profitCents, product.currency)}`
                : ""}
            </small>
          </Link>
        ))}
      </div>
    </aside>
  );
}

function ProductForm({ categories, draftIndex = 0, families, product }) {
  const selectedCategoryIds = new Set(
    product?.storefrontCategoryIds?.length
      ? product.storefrontCategoryIds
      : [categories[0]?.id].filter(Boolean)
  );
  const selectedFamily = product?.productFamily ?? families[0] ?? "slider";

  return (
    <form
      action={upsertAdminProductAction}
      className="admin-operation-form admin-product-form"
      encType="multipart/form-data"
    >
      <input name="productId" type="hidden" value={product?.id ?? ""} />
      <input name="previousSlug" type="hidden" value={product?.slug ?? ""} />

      <div className="admin-form-block">
        <h2>
          {product
            ? "Identificacao do produto"
            : `Novo produto${draftIndex ? ` #${draftIndex}` : ""}`}
        </h2>
        <div className="form-grid">
          <label>
            <span>Nome <RequiredMark /></span>
            <input
              autoComplete="off"
              defaultValue={product?.name ?? ""}
              name="name"
              placeholder="Ex: Ponteira SC Project"
              required
            />
          </label>
          <label>
            <span>Slug / ID</span>
            <input
              autoComplete="off"
              defaultValue={product?.slug ?? ""}
              name="slug"
              placeholder="ex: slider-r15-preto"
            />
            <small>Opcional. Se ficar vazio, o sistema gera pelo nome.</small>
          </label>
          <label>
            <span>Familia tecnica <RequiredMark /></span>
            <select defaultValue={selectedFamily} name="productFamily" required>
              {families.map((family) => (
                <option key={family} value={family}>
                  {family}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="admin-form-block">
        <h2>Preco e operacao</h2>
        <div className="form-grid">
          <label>
            <span>Preco do cliente <RequiredMark /></span>
            <input
              defaultValue={productPriceToInput(product?.priceCents)}
              inputMode="decimal"
              name="price"
              pattern="[0-9.,]+"
              placeholder="199,90"
              required
              title="Use um valor como 199,90, 199.90 ou 2.490,00."
            />
            <small>Valor que aparece no site e sera cobrado do cliente.</small>
          </label>
          <label>
            <span>Preco real interno</span>
            <input
              defaultValue={productCostToInput(product?.costCents)}
              inputMode="decimal"
              name="cost"
              pattern="[0-9.,]+"
              placeholder="120,00"
              title="Custo interno do produto para calculo de lucro."
            />
            <small>Visivel apenas no admin. Fica fora do catalogo publico.</small>
          </label>
          <label>
            <span>Disponibilidade</span>
            <input
              defaultValue={product?.availability ?? "sob-consulta"}
              name="availability"
            />
          </label>
          <label>
            <span>Prazo em dias uteis</span>
            <input
              defaultValue={product?.leadTimeDays ?? 2}
              min="0"
              name="leadTimeDays"
              type="number"
            />
          </label>
          <label>
            <span>Frete</span>
            <input defaultValue={product?.shippingClass ?? "medium"} name="shippingClass" />
          </label>
          <div className="admin-profit-preview span-all">
            <span>Lucro estimado do produto</span>
            <strong>
              {Number.isInteger(product?.profitCents)
                ? formatCurrency(product.profitCents, product.currency)
                : "Informe o preco real para calcular"}
            </strong>
            {Number.isInteger(product?.marginPercent) ? (
              <small>{product.marginPercent}% de margem sobre o preco do cliente</small>
            ) : null}
          </div>
        </div>
      </div>

      <div className="admin-form-block">
        <h2>Categorias e compatibilidade</h2>
        <div className="form-grid">
          <fieldset className="span-all admin-checkbox-fieldset">
            <legend>Categorias <RequiredMark /></legend>
            <div className="admin-checkbox-grid">
              {categories.map((category) => (
                <label key={category.id}>
                  <input
                    defaultChecked={selectedCategoryIds.has(category.id)}
                    name="categoryIds"
                    type="checkbox"
                    value={category.id}
                  />
                  <span>{category.label}</span>
                </label>
              ))}
            </div>
            <p className="form-helper-text">Selecione pelo menos uma categoria para publicar na vitrine.</p>
          </fieldset>
          <label className="span-all">
            <span>Escopo tecnico</span>
            <input
              defaultValue={arrayToTextarea(product?.bikeModelScope) || "yamaha-r15"}
              name="bikeModelScope"
            />
          </label>
        </div>
      </div>

      <div className="admin-form-block">
        <h2>Vitrine</h2>
        <div className="form-grid">
          <label className="span-all">
            <span>Variacoes <RequiredMark /></span>
            <textarea
              defaultValue={arrayToTextarea(product?.variations) || "Padrao"}
              name="variations"
              required
              rows={3}
            />
            <small>Uma por linha ou separadas por virgula.</small>
          </label>
          <ProductImageUploader existingImageUrls={product?.imageUrls ?? []} />
          <label className="span-all">
            <span>Notas</span>
            <textarea defaultValue={product?.notes ?? ""} name="notes" rows={4} />
          </label>
          <label className="admin-toggle-row span-all">
            <input defaultChecked={product?.isPublished ?? true} name="isPublished" type="checkbox" />
            <span>Publicado na vitrine</span>
          </label>
        </div>
      </div>

      <div className="admin-product-actions">
        <button className="button button-primary" type="submit">
          Salvar produto
        </button>
      </div>
    </form>
  );
}

function CouponList({ coupons, selectedCouponCode }) {
  return (
    <aside className="admin-list-panel">
      <div className="admin-panel-heading">
        <p className="section-label">Promocoes</p>
        <strong>{coupons.length} cupons</strong>
      </div>

      <div className="admin-product-list">
        <Link
          className={`admin-product-link ${!selectedCouponCode ? "is-active" : ""}`}
          href="/admin?tab=cupons"
        >
          <span>
            <strong>Criar cupom</strong>
            <em>Nova regra de desconto</em>
          </span>
          <small>Novo</small>
        </Link>

        {coupons.map((coupon) => (
          <Link
            className={`admin-product-link ${
              selectedCouponCode === coupon.code ? "is-active" : ""
            }`}
            href={`/admin?tab=cupons&cupom=${encodeURIComponent(coupon.code)}`}
            key={coupon.id}
          >
            <span>
              <strong>{coupon.code}</strong>
              <em>
                {coupon.discountType === "percent"
                  ? `${coupon.discountPercent}%`
                  : formatCurrency(coupon.discountCents)}
              </em>
            </span>
            <small>
              {coupon.isActive ? "Ativo" : "Inativo"} - {coupon.redemptionCount} uso(s)
            </small>
          </Link>
        ))}
      </div>
    </aside>
  );
}

function CouponForm({ categories, coupon, products }) {
  const selectedProductIds = new Set(coupon?.appliesToProductIds ?? []);
  const selectedCategoryIds = new Set(coupon?.appliesToCategoryIds ?? []);
  const discountType = coupon?.discountType ?? "percent";

  return (
    <form action={upsertAdminCouponAction} className="admin-operation-form admin-product-form">
      <div className="admin-form-block">
        <h2>{coupon ? `Cupom ${coupon.code}` : "Novo cupom"}</h2>
        <div className="form-grid">
          <label>
            <span>Codigo <RequiredMark /></span>
            <input
              autoComplete="off"
              defaultValue={coupon?.code ?? ""}
              name="couponCode"
              pattern="[A-Za-z0-9_-]{3,40}"
              placeholder="R15OFF"
              required
              title="Use letras, numeros, hifen ou underline."
            />
          </label>
          <div className="admin-form-inline-field">
            <span>Status</span>
            <label className="admin-toggle-row">
              <input
                defaultChecked={coupon?.isActive ?? true}
                name="couponIsActive"
                type="checkbox"
              />
              <span>Cupom ativo</span>
            </label>
          </div>
          <label className="span-all">
            <span>Descricao interna</span>
            <input
              defaultValue={coupon?.description ?? ""}
              name="couponDescription"
              placeholder="Ex: campanha de lancamento"
            />
          </label>
        </div>
      </div>

      <div className="admin-form-block">
        <h2>Desconto</h2>
        <div className="form-grid">
          <label>
            <span>Tipo <RequiredMark /></span>
            <select defaultValue={discountType} name="discountType" required>
              <option value="percent">Percentual</option>
              <option value="fixed">Valor fixo</option>
            </select>
          </label>
          <label>
            <span>Percentual</span>
            <input
              defaultValue={coupon?.discountPercent ?? ""}
              max="100"
              min="1"
              name="discountPercent"
              placeholder="10"
              type="number"
            />
            <small>Usado quando o tipo for percentual.</small>
          </label>
          <label>
            <span>Valor fixo</span>
            <input
              defaultValue={productPriceToInput(coupon?.discountCents)}
              inputMode="decimal"
              name="discountValue"
              pattern="[0-9.,]+"
              placeholder="50,00"
            />
            <small>Usado quando o tipo for valor fixo.</small>
          </label>
          <label>
            <span>Subtotal minimo</span>
            <input
              defaultValue={productPriceToInput(coupon?.minimumSubtotalCents)}
              inputMode="decimal"
              name="minimumSubtotal"
              pattern="[0-9.,]+"
              placeholder="0,00"
            />
          </label>
          <label>
            <span>Limite de usos</span>
            <input
              defaultValue={coupon?.maxRedemptions ?? ""}
              min="1"
              name="maxRedemptions"
              placeholder="sem limite"
              type="number"
            />
          </label>
        </div>
      </div>

      <div className="admin-form-block">
        <h2>Validade e aplicacao</h2>
        <div className="form-grid">
          <label>
            <span>Comeca em</span>
            <input defaultValue={dateTimeToInput(coupon?.startsAt)} name="startsAt" type="datetime-local" />
          </label>
          <label>
            <span>Expira em</span>
            <input defaultValue={dateTimeToInput(coupon?.expiresAt)} name="expiresAt" type="datetime-local" />
          </label>
          <fieldset className="span-all admin-checkbox-fieldset">
            <legend>Categorias aplicaveis</legend>
            <div className="admin-checkbox-grid">
              {categories.map((category) => (
                <label key={category.id}>
                  <input
                    defaultChecked={selectedCategoryIds.has(category.id)}
                    name="couponCategoryIds"
                    type="checkbox"
                    value={category.id}
                  />
                  <span>{category.label}</span>
                </label>
              ))}
            </div>
            <p className="form-helper-text">
              Sem categoria e sem produto selecionado, o cupom vale para todo o carrinho.
            </p>
          </fieldset>
          <fieldset className="span-all admin-checkbox-fieldset admin-product-coupon-fieldset">
            <legend>Produtos aplicaveis</legend>
            <div className="admin-checkbox-grid">
              {products.map((product) => (
                <label key={product.id}>
                  <input
                    defaultChecked={selectedProductIds.has(product.id)}
                    name="couponProductIds"
                    type="checkbox"
                    value={product.id}
                  />
                  <span>{product.name}</span>
                </label>
              ))}
            </div>
          </fieldset>
        </div>
      </div>

      <div className="admin-product-actions">
        <button className="button button-primary" type="submit">
          Salvar cupom
        </button>
      </div>
    </form>
  );
}

function AdminCoupons({ selectedCouponCode, state }) {
  const selectedCoupon = state.coupons.find((coupon) => coupon.code === selectedCouponCode);

  return (
    <section className="admin-shell admin-products-shell">
      <CouponList coupons={state.coupons} selectedCouponCode={selectedCouponCode} />

      <div className="admin-detail-panel admin-product-panel">
        <CouponForm
          categories={state.categories}
          coupon={selectedCoupon}
          products={state.products}
        />

        {selectedCoupon ? (
          <form action={archiveAdminCouponAction} className="admin-archive-form">
            <input name="couponCode" type="hidden" value={selectedCoupon.code} />
            <button className="button button-secondary" type="submit">
              Desativar cupom
            </button>
            <p>O cupom fica no historico e deixa de validar no carrinho.</p>
          </form>
        ) : null}
      </div>
    </section>
  );
}

function AdminProducts({ newProductCount, selectedProductId, state }) {
  const selectedProduct = state.products.find((product) => product.id === selectedProductId);
  const draftCount = selectedProduct ? newProductCount : Math.max(newProductCount, 1);
  const draftIndexes = Array.from({ length: draftCount }, (_, index) => index + 1);

  return (
    <section className="admin-shell admin-products-shell">
      <ProductList
        newProductCount={newProductCount}
        products={state.products}
        selectedProductId={selectedProductId}
      />

      <div className="admin-detail-panel admin-product-panel">
        {selectedProduct ? (
          <ProductForm
            categories={state.categories}
            families={state.families}
            product={selectedProduct}
          />
        ) : null}

        {draftIndexes.map((draftIndex) => (
          <ProductForm
            categories={state.categories}
            draftIndex={draftIndex}
            families={state.families}
            key={`new-product-${draftIndex}`}
          />
        ))}

        {selectedProduct ? (
          <form action={archiveAdminProductAction} className="admin-archive-form">
            <input name="productId" type="hidden" value={selectedProduct.id} />
            <input name="slug" type="hidden" value={selectedProduct.slug} />
            <button className="button button-secondary" type="submit">
              Arquivar produto
            </button>
            <p>
              Arquivar equivale a excluir da vitrine: o produto fica com
              <code>is_published=false</code> e nao quebra historico de pedidos.
            </p>
          </form>
        ) : null}
      </div>
    </section>
  );
}

function AdminOrders({ showNewOrder, state }) {
  return (
    <section className="admin-shell">
      <OrdersList
        orders={state.orders}
        selectedOrderNumber={state.selected?.order?.order_number ?? ""}
      />
      {showNewOrder ? (
        <NewOrderForm products={state.products ?? []} />
      ) : (
        <OrderDetail selected={state.selected} />
      )}
    </section>
  );
}

export default async function AdminPage({ searchParams }) {
  const params = await searchParams;
  const message = getMessage(params);
  const activeTab = getActiveAdminTab(params);
  const newProductCount = getNewProductCount(params);

  if (!isAdminTokenConfigured()) {
    redirect("/entrar?next=/admin");
  }

  if (!(await isAdminSessionValid())) {
    redirect("/entrar?next=/admin");
  }

  let state;

  try {
    state =
      activeTab === "produtos" || activeTab === "cupons"
        ? await getAdminCatalogState()
        : await getAdminDashboardState({ selectedOrderNumber: params?.pedido });
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
        <div className="admin-toolbar-actions">
          {activeTab === "pedidos" ? (
            <Link className="button button-primary" href="/admin?novoPedido=1">
              Adicionar pedido
            </Link>
          ) : null}
          {activeTab === "produtos" ? (
            <Link
              className="button button-primary"
              href={buildAddProductHref({
                newProductCount,
                selectedProductId: params?.produto ?? ""
              })}
            >
              Adicionar produto
            </Link>
          ) : null}
          {activeTab === "cupons" ? (
            <Link className="button button-primary" href="/admin?tab=cupons">
              Criar cupom
            </Link>
          ) : null}
          <form action={adminSignOutAction}>
            <button className="button button-secondary" type="submit">
              Sair
            </button>
          </form>
        </div>
      </section>

      <AdminTabs activeTab={activeTab} />

      {message ? <p className="form-alert admin-message">{message}</p> : null}

      {activeTab === "produtos" ? (
        <AdminProducts
          newProductCount={newProductCount}
          selectedProductId={params?.produto ?? ""}
          state={state}
        />
      ) : activeTab === "cupons" ? (
        <AdminCoupons selectedCouponCode={params?.cupom ?? ""} state={state} />
      ) : activeTab === "analise" ? (
        <AdminAnalytics analytics={state.analytics} pendingReviews={state.pendingReviews ?? []} />
      ) : (
        <AdminOrders showNewOrder={params?.novoPedido === "1"} state={state} />
      )}
    </main>
  );
}
