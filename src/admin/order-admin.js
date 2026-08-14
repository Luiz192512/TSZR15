import "server-only";

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
    sizeOptions: row.size_options ?? [],
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
    sizeOptions: product.sizeOptions ?? [],
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
    throw new Error(error.message);
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
        "id, slug, name, storefront_category_ids, product_family, bike_model_scope, price_cents, currency, variations, size_options, checkout_channel, internal_purchase_source, is_published"
      )
      .eq("is_published", true)
      .order("name", { ascending: true })
      .limit(limit),
    supabase.from("catalog_product_costs").select("product_id, cost_cents")
  ]);

  const firstError = error ?? costError;

  if (firstError) {
    throw new Error(firstError.message);
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
    throw new Error(error.message);
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
    throw new Error(orderError.message);
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
    throw new Error(firstError.message);
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
    .select("*")
    .limit(1);

  orderQuery = orderId
    ? orderQuery.eq("id", orderId)
    : orderQuery.eq("order_number", cleanString(orderNumber, 80).toUpperCase());

  const { data: order, error } = await orderQuery.maybeSingle();

  if (error) {
    throw new Error(error.message);
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
    supabase.from("order_items").select("*").eq("order_id", order.id).order("created_at"),
    supabase.from("payments").select("*").eq("order_id", order.id).order("created_at"),
    supabase.from("supplier_purchases").select("*").eq("order_id", order.id).order("created_at"),
    supabase
      .from("supplier_tracking_events")
      .select("*")
      .eq("order_id", order.id)
      .order("event_at", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase.from("support_threads").select("*").eq("order_id", order.id).order("created_at"),
    supabase
      .from("audit_logs")
      .select("*")
      .eq("order_id", order.id)
      .order("created_at", { ascending: false })
      .limit(12)
  ]);

  const firstError =
    itemsError ?? paymentsError ?? supplierError ?? trackingError ?? supportError ?? auditError;

  if (firstError) {
    throw new Error(firstError.message);
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
          // Produto sem grade fica com size "": o draft recusa tamanho em
          // produto sem grade e exige um da grade quando ela existe.
          size:
            cleanString(formData.get("size"), 40) || (selectedProduct.sizeOptions?.[0] ?? ""),
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
      throw new Error(error.message);
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
    throw new Error(error.message);
  }

  return {
    internalOrderStatus: data?.internalOrderStatus ?? internalOrderStatus,
    orderNumber: data?.orderNumber ?? orderNumber
  };
}
