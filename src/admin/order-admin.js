import "server-only";

import { createAdminDatabaseError } from "@/src/admin/admin-action-error.js";
import { createServiceRoleSupabaseClient } from "@/src/lib/supabase/admin.js";
import { buildCheckoutOrderDraft, persistCheckoutOrder } from "@/src/checkout/order-backend.js";
import { buildAdminOrderAnalytics } from "@/src/admin/order-analytics.js";
import { fetchRowsForOrderIds } from "@/src/admin/order-related-rows.js";
import {
  buildAdminOrderOperationRpcArgs,
  saveAdminOrderOperation
} from "@/src/admin/order-operation.js";
import { catalogProducts } from "@/src/catalog/index.js";
import { listPendingOrderReviews } from "@/src/reviews/order-reviews.js";
import {
  internalOrderDecisionStatuses,
  internalOrderPendingAfterMs,
  isKnownStatus
} from "@/src/orders/status.js";

// Colunas lidas por OrderDetail em app/admin/_components/admin-orders-view.js.
// Manter em sincronia com o que a tela renderiza: nada de select("*") aqui.
const adminOrderDetailColumns = [
  "id",
  "order_number",
  "customer_name",
  "customer_email",
  "customer_whatsapp",
  "customer_phone",
  "customer_tax_id",
  "address_snapshot",
  "total_cents",
  "currency",
  "payment_status",
  "operational_status",
  "internal_notes",
  "assigned_operator",
  "internal_order_status",
  "created_at"
].join(",");
const adminOrderItemColumns = [
  "id",
  "product_name",
  "variation",
  "quantity",
  "subtotal_cents",
  "subtotal_cost_cents",
  "currency",
  "created_at"
].join(",");
const adminOrderPaymentColumns = ["id", "provider", "provider_reference", "created_at"].join(",");
const adminSupplierPurchaseColumns = [
  "id",
  "internal_channel",
  "source_status",
  "source_store_name",
  "source_order_number",
  "source_product_url",
  "operational_account",
  "purchased_at",
  "product_cost_cents",
  "shipping_cost_cents",
  "currency",
  "exchange_rate",
  "source_eta",
  "carrier",
  "tracking_code",
  "proof_url",
  "internal_notes",
  "created_at"
].join(",");
const adminTrackingEventColumns = [
  "id",
  "event_status",
  "event_at",
  "description",
  "created_at"
].join(",");
// support_threads e audit_logs sao carregados mas nenhuma tela os renderiza
// hoje; ficam com o minimo identificavel ate a decisao de remover as consultas.
const adminSupportThreadColumns = ["id", "order_id", "status", "created_at"].join(",");
const adminAuditLogColumns = ["id", "order_id", "action", "created_at"].join(",");

function cleanString(value, maxLength = 500) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function cleanNullable(value, maxLength = 500) {
  const cleaned = cleanString(value, maxLength);
  return cleaned || null;
}

function toOrderFormProduct(row) {
  return {
    bikeModelScope: row.bike_model_scope ?? ["yamaha-r15"],
    checkoutChannel: row.checkout_channel ?? "whatsapp-business",
    currency: row.currency ?? "BRL",
    id: row.id,
    internalPurchaseSource: row.internal_purchase_source ?? {
      provider: "painel-admin",
      visibility: "internal-only"
    },
    name: row.name,
    costCents: row.cost_cents ?? null,
    priceCents: row.price_cents,
    productFamily: row.product_family,
    slug: row.slug,
    storefrontCategoryIds: row.storefront_category_ids ?? [],
    variations: row.variations ?? []
  };
}

function getFallbackOrderProducts() {
  return catalogProducts.map((product) => ({
    bikeModelScope: product.bikeModelScope,
    checkoutChannel: product.checkoutChannel,
    currency: product.currency,
    id: product.id,
    internalPurchaseSource: product.internalPurchaseSource,
    name: product.name,
    costCents: product.costCents ?? null,
    priceCents: product.priceCents,
    productFamily: product.productFamily,
    slug: product.slug,
    storefrontCategoryIds: product.storefrontCategoryIds,
    variations: product.variations
  }));
}

export function getAdminSupabaseStatus() {
  const supabase = createServiceRoleSupabaseClient();

  return {
    isConfigured: Boolean(supabase),
    supabase
  };
}

export async function listAdminOrders({ limit = 30, supabase } = {}) {
  if (!supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from("orders")
    .select(
      "id, order_number, customer_name, customer_whatsapp, total_cents, currency, payment_status, operational_status, internal_order_status, internal_order_status_updated_at, assigned_operator, created_at, updated_at"
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw createAdminDatabaseError(error, "listar pedidos");
  }

  return data ?? [];
}

export async function listAdminOrderProducts({ supabase, limit = 160 } = {}) {
  if (!supabase) {
    return [];
  }

  const [{ data, error }, { data: costRows, error: costError }] = await Promise.all([
    supabase
      .from("catalog_products")
      .select(
        "id, slug, name, storefront_category_ids, product_family, bike_model_scope, price_cents, currency, variations, checkout_channel, internal_purchase_source, is_published"
      )
      .eq("is_published", true)
      .order("name", { ascending: true })
      .limit(limit),
    supabase.from("catalog_product_costs").select("product_id, cost_cents")
  ]);

  const firstError = error ?? costError;

  if (firstError) {
    throw createAdminDatabaseError(firstError, "listar produtos para pedido");
  }

  const costsByProductId = new Map((costRows ?? []).map((row) => [row.product_id, row.cost_cents]));
  const rows = (data ?? []).map((row) => ({
    ...row,
    cost_cents: costsByProductId.get(row.id) ?? null
  }));

  return rows.length ? rows.map(toOrderFormProduct) : getFallbackOrderProducts();
}

export async function markStaleInternalOrdersPending({ supabase, now = new Date() } = {}) {
  if (!supabase) {
    return;
  }

  const cutoff = new Date(now.getTime() - internalOrderPendingAfterMs).toISOString();
  const { error } = await supabase
    .from("orders")
    .update({
      internal_order_status: "pendente",
      internal_order_status_updated_at: now.toISOString()
    })
    .is("internal_order_status", null)
    .lte("created_at", cutoff);

  if (error) {
    throw createAdminDatabaseError(error, "marcar pedidos internos pendentes");
  }
}

export async function getAdminOrderAnalytics({ supabase } = {}) {
  if (!supabase) {
    return buildAdminOrderAnalytics();
  }

  const { data: orders, error: orderError } = await supabase
    .from("orders")
    .select(
      "id, customer_name, customer_email, customer_whatsapp, total_cents, payment_status, operational_status, internal_order_status, created_at"
    )
    .order("created_at", { ascending: false })
    .limit(1000);

  if (orderError) {
    throw createAdminDatabaseError(orderError, "carregar analytics de pedidos");
  }

  const orderIds = (orders ?? []).map((order) => order.id);
  const [
    { data: supplierPurchases, error: supplierError },
    { data: orderItems, error: itemError },
    { data: reviews, error: reviewError }
  ] = await Promise.all([
    fetchRowsForOrderIds({
      buildQuery: (chunk) =>
        supabase
          .from("supplier_purchases")
          .select("order_id, product_cost_cents, shipping_cost_cents")
          .in("order_id", chunk)
          .limit(5000),
      orderIds
    }),
    fetchRowsForOrderIds({
      buildQuery: (chunk) =>
        supabase
          .from("order_items")
          .select(
            "order_id, product_id, product_slug, product_name, quantity, subtotal_cents, subtotal_cost_cents"
          )
          .in("order_id", chunk)
          .limit(5000),
      orderIds
    }),
    supabase
      .from("order_item_reviews")
      .select("product_id, product_name, rating, status")
      .limit(5000)
  ]);

  const firstError = supplierError ?? itemError ?? reviewError;

  if (firstError) {
    throw createAdminDatabaseError(firstError, "carregar analytics de pedidos");
  }

  return buildAdminOrderAnalytics({
    orderItems: orderItems ?? [],
    orders: orders ?? [],
    reviews: reviews ?? [],
    supplierPurchases: supplierPurchases ?? []
  });
}

export async function getAdminOrder({ orderId, orderNumber, supabase }) {
  if (!supabase || (!orderId && !orderNumber)) {
    return null;
  }

  let orderQuery = supabase
    .from("orders")
    .select(adminOrderDetailColumns)
    .limit(1);

  orderQuery = orderId
    ? orderQuery.eq("id", orderId)
    : orderQuery.eq("order_number", cleanString(orderNumber, 80).toUpperCase());

  const { data: order, error } = await orderQuery.maybeSingle();

  if (error) {
    throw createAdminDatabaseError(error, "carregar pedido selecionado");
  }

  if (!order) {
    return null;
  }

  const [
    { data: items, error: itemsError },
    { data: payments, error: paymentsError },
    { data: supplierPurchases, error: supplierError },
    { data: trackingEvents, error: trackingError },
    { data: supportThreads, error: supportError },
    { data: auditLogs, error: auditError }
  ] = await Promise.all([
    supabase
      .from("order_items")
      .select(adminOrderItemColumns)
      .eq("order_id", order.id)
      .order("created_at"),
    supabase
      .from("payments")
      .select(adminOrderPaymentColumns)
      .eq("order_id", order.id)
      .order("created_at"),
    supabase
      .from("supplier_purchases")
      .select(adminSupplierPurchaseColumns)
      .eq("order_id", order.id)
      .order("created_at"),
    supabase
      .from("supplier_tracking_events")
      .select(adminTrackingEventColumns)
      .eq("order_id", order.id)
      .order("event_at", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("support_threads")
      .select(adminSupportThreadColumns)
      .eq("order_id", order.id)
      .order("created_at"),
    supabase
      .from("audit_logs")
      .select(adminAuditLogColumns)
      .eq("order_id", order.id)
      .order("created_at", { ascending: false })
      .limit(12)
  ]);

  const firstError =
    itemsError ?? paymentsError ?? supplierError ?? trackingError ?? supportError ?? auditError;

  if (firstError) {
    throw createAdminDatabaseError(firstError, "carregar dados relacionados do pedido");
  }

  return {
    auditLogs: auditLogs ?? [],
    items: items ?? [],
    order,
    payments: payments ?? [],
    supplierPurchase: supplierPurchases?.[0] ?? null,
    supportThreads: supportThreads ?? [],
    trackingEvents: trackingEvents ?? []
  };
}

export async function getAdminOrdersState({ selectedOrderNumber } = {}) {
  const { isConfigured, supabase } = getAdminSupabaseStatus();

  if (!isConfigured) {
    return {
      isConfigured,
      orders: [],
      selected: null
    };
  }

  await markStaleInternalOrdersPending({ supabase });

  const [orders, products] = await Promise.all([
    listAdminOrders({ supabase }),
    listAdminOrderProducts({ supabase })
  ]);
  const selectedOrder =
    selectedOrderNumber ?? orders.find((order) => order.order_number)?.order_number ?? "";

  return {
    isConfigured,
    orders,
    products,
    selected: await getAdminOrder({ orderNumber: selectedOrder, supabase })
  };
}

export async function getAdminAnalyticsState() {
  const { isConfigured, supabase } = getAdminSupabaseStatus();

  if (!isConfigured) {
    return {
      analytics: buildAdminOrderAnalytics(),
      isConfigured,
      pendingReviews: []
    };
  }

  await markStaleInternalOrdersPending({ supabase });

  const [analytics, pendingReviews] = await Promise.all([
    getAdminOrderAnalytics({ supabase }),
    listPendingOrderReviews({ supabase })
  ]);

  return {
    analytics,
    isConfigured,
    pendingReviews
  };
}

export async function createAdminManualOrder(formData) {
  const { isConfigured, supabase } = getAdminSupabaseStatus();

  if (!isConfigured) {
    throw new Error("Configure a URL do Supabase e uma chave privilegiada do Supabase.");
  }

  const products = await listAdminOrderProducts({ supabase });
  const productId = cleanString(formData.get("productId"), 160);
  const selectedProduct = products.find(
    (product) => product.id === productId || product.slug === productId
  );

  if (!selectedProduct) {
    throw new Error("Selecione um produto publicado para criar o pedido.");
  }

  const draft = buildCheckoutOrderDraft(
    {
      cartItems: [
        {
          id: selectedProduct.id,
          quantity: Number.parseInt(cleanString(formData.get("quantity"), 20), 10) || 1,
          variation: cleanString(formData.get("variation"), 120) || selectedProduct.variations[0]
        }
      ],
      customer: {
        address: cleanString(formData.get("customerAddress"), 1000),
        cep: cleanString(formData.get("customerCep"), 20),
        email: cleanString(formData.get("customerEmail"), 320),
        name: cleanString(formData.get("customerName"), 200),
        notes: cleanString(formData.get("customerNotes"), 1000),
        phone: cleanString(formData.get("customerPhone"), 40),
        taxId: cleanString(formData.get("customerTaxId"), 40),
        whatsapp: cleanString(formData.get("customerWhatsapp"), 40)
      },
      hasDataConsent: true,
      paymentMethodId: cleanString(formData.get("paymentMethodId"), 80) || "pix",
      shippingOptionId: cleanString(formData.get("shippingOptionId"), 80) || "combinar"
    },
    {
      products,
      storeName: "TSZR15"
    }
  );

  const result = await persistCheckoutOrder({
    draft,
    requestContext: {
      source: "admin_manual_order"
    },
    supabase,
    user: null
  });

  if (!result.saved || !result.id) {
    throw new Error(result.reason || "Nao foi possivel salvar o pedido.");
  }

  const internalNotes = cleanNullable(formData.get("orderInternalNotes"), 1800);

  if (internalNotes) {
    const { error } = await supabase
      .from("orders")
      .update({
        internal_notes: internalNotes
      })
      .eq("id", result.id);

    if (error) {
      throw createAdminDatabaseError(error, "criar pedido manual");
    }
  }

  await supabase.from("audit_logs").insert({
    action: "admin_manual_order_created",
    metadata: {
      orderNumber: result.orderNumber,
      productId: selectedProduct.id
    },
    order_id: result.id
  });

  return {
    orderNumber: result.orderNumber
  };
}

export async function updateAdminOrderOperation(formData) {
  const { isConfigured, supabase } = getAdminSupabaseStatus();

  if (!isConfigured) {
    throw new Error("Configure a URL do Supabase e uma chave privilegiada do Supabase.");
  }

  const args = buildAdminOrderOperationRpcArgs(formData);
  return saveAdminOrderOperation({ args, supabase });
}

export async function setAdminInternalOrderStatus(formData) {
  const { isConfigured, supabase } = getAdminSupabaseStatus();

  if (!isConfigured) {
    throw new Error("Configure a URL do Supabase e uma chave privilegiada do Supabase.");
  }

  const orderId = cleanString(formData.get("orderId"), 80);
  const orderNumber = cleanString(formData.get("orderNumber"), 80);
  const internalOrderStatus = cleanString(formData.get("internalOrderStatus"), 80);

  if (!orderId) {
    throw new Error("Pedido invalido.");
  }

  if (!isKnownStatus(internalOrderStatus, internalOrderDecisionStatuses)) {
    throw new Error("Status interno invalido.");
  }

  const { data, error } = await supabase.rpc("set_admin_internal_order_status", {
    p_internal_status: internalOrderStatus,
    p_order_id: orderId
  });

  if (error) {
    throw createAdminDatabaseError(error, "alterar status interno do pedido");
  }

  return {
    internalOrderStatus: data?.internalOrderStatus ?? internalOrderStatus,
    orderNumber: data?.orderNumber ?? orderNumber
  };
}
