import Link from "next/link";
import { redirect } from "next/navigation";

import {
  adminSignOutAction,
  archiveAdminProductAction,
  upsertAdminProductAction,
  updateAdminOrderAction
} from "@/app/admin/actions.js";
import { isAdminSessionValid, isAdminTokenConfigured } from "@/src/admin/admin-auth.js";
import { getAdminCatalogState } from "@/src/admin/catalog-admin.js";
import { getAdminDashboardState } from "@/src/admin/order-admin.js";
import { formatCategoryLabels } from "@/src/catalog/index.js";
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
export const dynamic = "force-dynamic";
export const revalidate = 0;

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

function getActiveAdminTab(params) {
  return params?.tab === "produtos" ? "produtos" : "pedidos";
}

function getMessage(params) {
  if (params?.status === "salvo") {
    return "Pedido atualizado.";
  }

  if (params?.status === "produto-salvo") {
    return "Produto salvo no catalogo.";
  }

  if (params?.status === "produto-arquivado") {
    return "Produto arquivado da vitrine.";
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

function ProductList({ products, selectedProductId }) {
  return (
    <aside className="admin-list-panel">
      <div className="admin-panel-heading">
        <p className="section-label">Catalogo</p>
        <strong>{products.length} produtos</strong>
      </div>

      <div className="admin-product-list">
        <Link
          className={`admin-product-link ${!selectedProductId ? "is-active" : ""}`}
          href="/admin?tab=produtos"
        >
          <span>
            <strong>Novo produto</strong>
            <em>Criar SKU no Supabase</em>
          </span>
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
            <small>{product.isPublished ? "Publicado" : "Arquivado"}</small>
          </Link>
        ))}
      </div>
    </aside>
  );
}

function ProductForm({ categories, families, product }) {
  const selectedCategoryIds = new Set(
    product?.storefrontCategoryIds?.length
      ? product.storefrontCategoryIds
      : [categories[0]?.id].filter(Boolean)
  );
  const selectedFamily = product?.productFamily ?? families[0] ?? "slider";

  return (
    <form action={upsertAdminProductAction} className="admin-operation-form admin-product-form">
      <input name="productId" type="hidden" value={product?.id ?? ""} />
      <input name="previousSlug" type="hidden" value={product?.slug ?? ""} />

      <div className="admin-form-block">
        <h2>{product ? "Editar produto" : "Novo produto"}</h2>
        <div className="form-grid">
          <label>
            <span>Nome</span>
            <input defaultValue={product?.name ?? ""} name="name" required />
          </label>
          <label>
            <span>Slug / ID</span>
            <input
              defaultValue={product?.slug ?? ""}
              name="slug"
              placeholder="ex: slider-r15-preto"
            />
          </label>
          <label>
            <span>Familia tecnica</span>
            <select defaultValue={selectedFamily} name="productFamily">
              {families.map((family) => (
                <option key={family} value={family}>
                  {family}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Preco</span>
            <input
              defaultValue={productPriceToInput(product?.priceCents)}
              inputMode="decimal"
              name="price"
              placeholder="199,90"
              required
            />
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
          <label>
            <span>Escopo tecnico</span>
            <input
              defaultValue={arrayToTextarea(product?.bikeModelScope) || "yamaha-r15"}
              name="bikeModelScope"
            />
          </label>
          <fieldset className="span-all admin-checkbox-fieldset">
            <legend>Categorias</legend>
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
          </fieldset>
          <label className="span-all">
            <span>Variacoes</span>
            <textarea
              defaultValue={arrayToTextarea(product?.variations) || "Padrao"}
              name="variations"
              rows={3}
            />
          </label>
          <label className="span-all">
            <span>URLs de imagens</span>
            <textarea
              defaultValue={arrayToTextarea(product?.imageUrls)}
              name="imageUrls"
              placeholder="https://exemplo.com/imagem-1.jpg"
              rows={4}
            />
          </label>
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

function AdminProducts({ selectedProductId, state }) {
  const selectedProduct = state.products.find((product) => product.id === selectedProductId);

  return (
    <section className="admin-shell admin-products-shell">
      <ProductList products={state.products} selectedProductId={selectedProductId} />

      <div className="admin-detail-panel admin-product-panel">
        <ProductForm
          categories={state.categories}
          families={state.families}
          product={selectedProduct}
        />

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

export default async function AdminPage({ searchParams }) {
  const params = await searchParams;
  const message = getMessage(params);
  const activeTab = getActiveAdminTab(params);

  if (!isAdminTokenConfigured()) {
    redirect("/entrar?next=/admin");
  }

  if (!(await isAdminSessionValid())) {
    redirect("/entrar?next=/admin");
  }

  let state;

  try {
    state =
      activeTab === "produtos"
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
        <form action={adminSignOutAction}>
          <button className="button button-secondary" type="submit">
            Sair
          </button>
        </form>
      </section>

      <AdminTabs activeTab={activeTab} />

      {message ? <p className="form-alert admin-message">{message}</p> : null}

      {activeTab === "produtos" ? (
        <AdminProducts selectedProductId={params?.produto ?? ""} state={state} />
      ) : (
        <section className="admin-shell">
          <OrdersList
            orders={state.orders}
            selectedOrderNumber={state.selected?.order?.order_number ?? ""}
          />
          <OrderDetail selected={state.selected} />
        </section>
      )}
    </main>
  );
}
