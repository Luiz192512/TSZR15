import globalStyles from "@/app/storefront.module.css";
import { cx } from "@/src/lib/classnames";
import Link from "next/link";

import {
  createAdminOrderAction,
  setAdminInternalOrderStatusAction,
  updateAdminOrderAction
} from "@/app/admin/actions.js";
import { centsToInput, formatCurrency, StatusSelect } from "@/app/admin/_components/admin-ui.js";
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
import {
  formatAdminDateTimeInput,
  formatAdminDisplayDateTime as formatDateTime
} from "@/src/admin/admin-form-values.js";

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

export function InternalOrderBadge({ status }) {
  const config = getInternalOrderConfig(status);

  if (!config) {
    return null;
  }

  return (
    <span className={cx(globalStyles, `internal-order-badge is-${status}`)}>
      <span aria-hidden="true">{config.icon}</span>
      {config.label}
    </span>
  );
}

function OrdersList({ orders, selectedOrderNumber }) {
  return (
    <aside className={cx(globalStyles, "admin-list-panel")}>
      <div className={cx(globalStyles, "admin-panel-heading")}>
        <p className={cx(globalStyles, "section-label")}>Fila</p>
        <strong>{orders.length} pedidos recentes</strong>
      </div>

      <div className={cx(globalStyles, "admin-order-list")}>
        {orders.length === 0 ? (
          <p className={cx(globalStyles, "helper-text")}>Nenhum pedido salvo ainda.</p>
        ) : (
          orders.map((order) => {
            const internalStatus = getEffectiveInternalOrderStatus(order);

            return (
              <Link
                className={cx(
                  globalStyles,
                  `admin-order-link ${
                    selectedOrderNumber === order.order_number ? "is-active" : ""
                  } ${internalStatus ? `internal-order-${internalStatus}` : ""}`
                )}
                href={`/admin/pedidos?pedido=${encodeURIComponent(order.order_number)}`}
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
    <section className={cx(globalStyles, "admin-detail-panel")}>
      <div className={cx(globalStyles, "admin-detail-header")}>
        <div>
          <p className={cx(globalStyles, "section-label")}>Novo pedido</p>
          <h1>Adicionar pedido.</h1>
          <p>Crie um pedido manual usando um produto publicado no catalogo.</p>
        </div>
      </div>

      {products.length === 0 ? (
        <p className={cx(globalStyles, "helper-text")}>
          Cadastre ou publique um produto antes de criar um pedido manual.
        </p>
      ) : (
        <form action={createAdminOrderAction} className={cx(globalStyles, "admin-operation-form")}>
          <div className={cx(globalStyles, "admin-form-block")}>
            <h2>Cliente</h2>
            <div className={cx(globalStyles, "form-grid")}>
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
              <label className={cx(globalStyles, "span-all")}>
                <span>Endereco de entrega</span>
                <input name="customerAddress" required />
              </label>
              <label className={cx(globalStyles, "span-all")}>
                <span>Observacoes do cliente</span>
                <textarea name="customerNotes" rows={3} />
              </label>
            </div>
          </div>

          <div className={cx(globalStyles, "admin-form-block")}>
            <h2>Produto e pagamento</h2>
            <div className={cx(globalStyles, "form-grid")}>
              <label className={cx(globalStyles, "span-all")}>
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
                <span>Tamanho</span>
                <input
                  maxLength={40}
                  name="size"
                  placeholder="so para produtos com grade de tamanho"
                />
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
              <label className={cx(globalStyles, "span-all")}>
                <span>Observacoes internas</span>
                <textarea name="orderInternalNotes" rows={3} />
              </label>
            </div>
          </div>

          <button className={cx(globalStyles, "button button-primary")} type="submit">
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
      <section className={cx(globalStyles, "admin-detail-panel")}>
        <p className={cx(globalStyles, "section-label")}>Pedido</p>
        <h1>Nenhum pedido selecionado.</h1>
      </section>
    );
  }

  const { items, order, payments, supplierPurchase, trackingEvents } = selected;
  const internalStatus = getEffectiveInternalOrderStatus(order);

  return (
    <section className={cx(globalStyles, "admin-detail-panel")}>
      <div className={cx(globalStyles, "admin-detail-header")}>
        <div>
          <p className={cx(globalStyles, "section-label")}>Pedido interno</p>
          <h1>{order.order_number}</h1>
          <p>
            {order.customer_name} -{" "}
            {order.customer_whatsapp || order.customer_phone || "sem contato"}
          </p>
        </div>
        <div className={cx(globalStyles, "admin-total-box")}>
          <span>Total cobrado</span>
          <strong>{formatCurrency(order.total_cents, order.currency)}</strong>
        </div>
      </div>

      <div className={cx(globalStyles, "admin-status-grid")}>
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
        <div className={cx(globalStyles, internalStatus ? `internal-order-${internalStatus}` : "")}>
          <span>Pedido interno</span>
          <strong>
            {internalStatus ? getStatusLabel(internalStatus, internalOrderStatuses) : "Sem decisao"}
          </strong>
          <InternalOrderBadge status={internalStatus} />
        </div>
      </div>

      <div className={cx(globalStyles, "admin-content-grid")}>
        <div className={cx(globalStyles, "admin-section")}>
          <h2>Itens</h2>
          <div className={cx(globalStyles, "admin-item-list")}>
            {items.map((item) => (
              <div className={cx(globalStyles, "admin-item-row")} key={item.id}>
                <span>
                  <strong>{item.product_name}</strong>
                  <em>{item.size ? `${item.variation} - ${item.size}` : item.variation}</em>
                  {Number.isInteger(item.subtotal_cost_cents) ? (
                    <em>
                      Custo: {formatCurrency(item.subtotal_cost_cents, item.currency)} - Lucro:{" "}
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

        <div className={cx(globalStyles, "admin-section")}>
          <h2>Cliente e entrega</h2>
          <dl className={cx(globalStyles, "admin-definition-list")}>
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

      <form action={updateAdminOrderAction} className={cx(globalStyles, "admin-operation-form")}>
        <input name="orderId" type="hidden" value={order.id} />
        <input name="orderNumber" type="hidden" value={order.order_number} />
        <input name="operationId" type="hidden" value={crypto.randomUUID()} />
        <input name="supplierPurchaseId" type="hidden" value={supplierPurchase?.id ?? ""} />

        <div className={cx(globalStyles, "admin-form-block")}>
          <h2>Status do pedido</h2>
          <div className={cx(globalStyles, "form-grid")}>
            <label>
              <span>Status de pagamento</span>
              <StatusSelect
                items={paymentStatuses}
                name="paymentStatus"
                value={order.payment_status}
              />
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
            <label className={cx(globalStyles, "span-all")}>
              <span>Referencia do pagamento</span>
              <input defaultValue={payments[0]?.provider_reference ?? ""} name="paymentReference" />
            </label>
            <label className={cx(globalStyles, "span-all")}>
              <span>Observacoes internas do pedido</span>
              <textarea
                defaultValue={order.internal_notes ?? ""}
                name="orderInternalNotes"
                rows={3}
              />
            </label>
          </div>
        </div>

        <div className={cx(globalStyles, "admin-form-block")}>
          <h2>
            Origem interna e rastreio
            {/* Quem criou a linha muda o que o operador precisa fazer: a
                automacao PREPARA a compra, ela nao compra. Sem esta marca, uma
                linha criada pelo sistema parece uma compra ja feita. */}
            {supplierPurchase?.created_by === "automacao" ? (
              <span className={cx(globalStyles, "badge")}> criada pela automação</span>
            ) : null}
          </h2>
          {supplierPurchase?.created_by === "automacao" &&
          supplierPurchase?.source_status === "nao_comprado" ? (
            <p className={cx(globalStyles, "form-hint")}>
              O pagamento foi confirmado e o sistema abriu esta linha. A compra no fornecedor ainda
              precisa ser feita por uma pessoa.
            </p>
          ) : null}
          <div className={cx(globalStyles, "form-grid")}>
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
              <input
                defaultValue={supplierPurchase?.source_store_name ?? ""}
                name="sourceStoreName"
              />
            </label>
            <label>
              <span>Pedido na origem</span>
              <input
                defaultValue={supplierPurchase?.source_order_number ?? ""}
                name="sourceOrderNumber"
              />
            </label>
            <label className={cx(globalStyles, "span-all")}>
              <span>Link interno do produto</span>
              <input
                defaultValue={supplierPurchase?.source_product_url ?? ""}
                name="sourceProductUrl"
              />
            </label>
            <label>
              <span>Conta operacional</span>
              <input
                defaultValue={supplierPurchase?.operational_account ?? ""}
                name="operationalAccount"
              />
            </label>
            <label>
              <span>Comprado em</span>
              <input
                defaultValue={formatAdminDateTimeInput(supplierPurchase?.purchased_at)}
                name="purchasedAt"
                type="datetime-local"
              />
              <small>Horario de Brasilia.</small>
            </label>
            <label>
              <span>Custo produto</span>
              <input
                defaultValue={centsToInput(supplierPurchase?.product_cost_cents)}
                name="productCost"
              />
            </label>
            <label>
              <span>Custo frete</span>
              <input
                defaultValue={centsToInput(supplierPurchase?.shipping_cost_cents)}
                name="shippingCost"
              />
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
            <label className={cx(globalStyles, "span-all")}>
              <span>Notas da origem</span>
              <textarea
                defaultValue={supplierPurchase?.internal_notes ?? ""}
                name="supplierNotes"
                rows={3}
              />
            </label>
          </div>
        </div>

        <div className={cx(globalStyles, "admin-form-block")}>
          <h2>Novo evento de rastreio</h2>
          <div className={cx(globalStyles, "form-grid")}>
            <label>
              <span>Status do evento</span>
              <input name="trackingStatus" placeholder="em_transito" />
            </label>
            <label>
              <span>Data do evento</span>
              <input name="trackingEventAt" type="datetime-local" />
              <small>Horario de Brasilia.</small>
            </label>
            <label>
              <span>Local</span>
              <input name="trackingLocation" />
            </label>
            <label className={cx(globalStyles, "span-all")}>
              <span>Descricao publica</span>
              <textarea name="trackingDescription" rows={3} />
            </label>
          </div>
        </div>

        <button className={cx(globalStyles, "button button-primary")} type="submit">
          Salvar operacao
        </button>
      </form>

      <div className={cx(globalStyles, "admin-section")}>
        <h2>Eventos registrados</h2>
        <div className={cx(globalStyles, "tracking-event-list")}>
          {trackingEvents.length === 0 ? (
            <p className={cx(globalStyles, "helper-text")}>Nenhum evento de rastreio registrado.</p>
          ) : (
            trackingEvents.map((event) => (
              <div className={cx(globalStyles, "tracking-event-row")} key={event.id}>
                <strong>{getStatusLabel(event.event_status, operationalStatuses)}</strong>
                <span>{formatDateTime(event.event_at ?? event.created_at)}</span>
                <p>{event.description || "Sem descricao."}</p>
              </div>
            ))
          )}
        </div>
      </div>

      <div className={cx(globalStyles, "admin-internal-decision")}>
        <div>
          <p className={cx(globalStyles, "section-label")}>Decisao final</p>
          <h2>Confirmar ou recusar pedido interno.</h2>
          <p>
            Confirmar libera o pedido para operacao interna. Recusar marca o pedido como recusado
            sem apagar historico.
          </p>
        </div>
        <div className={cx(globalStyles, "admin-internal-decision-actions")}>
          <form action={setAdminInternalOrderStatusAction}>
            <input name="orderId" type="hidden" value={order.id} />
            <input name="orderNumber" type="hidden" value={order.order_number} />
            <input name="internalOrderStatus" type="hidden" value="confirmado" />
            <button className={cx(globalStyles, "button button-success")} type="submit">
              <span aria-hidden="true">{"\u2713"}</span>
              Confirmar pedido interno
            </button>
          </form>
          <form action={setAdminInternalOrderStatusAction}>
            <input name="orderId" type="hidden" value={order.id} />
            <input name="orderNumber" type="hidden" value={order.order_number} />
            <input name="internalOrderStatus" type="hidden" value="recusado" />
            <button className={cx(globalStyles, "button button-danger")} type="submit">
              <span aria-hidden="true">X</span>
              Recusar pedido interno
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}

export function AdminOrders({ showNewOrder, state }) {
  return (
    <section className={cx(globalStyles, "admin-shell")}>
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
