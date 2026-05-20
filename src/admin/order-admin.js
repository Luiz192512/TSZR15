import "server-only";

import { createServiceRoleSupabaseClient } from "@/src/lib/supabase/admin.js";
import {
  isKnownStatus,
  operationalStatuses,
  paymentStatuses,
  supplierSourceStatuses
} from "@/src/orders/status.js";

function cleanString(value, maxLength = 500) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function cleanNullable(value, maxLength = 500) {
  const cleaned = cleanString(value, maxLength);
  return cleaned || null;
}

function parseMoneyToCents(value) {
  const cleaned = cleanString(value, 40).replace(/\./g, "").replace(",", ".");

  if (!cleaned) {
    return null;
  }

  const numeric = Number(cleaned);

  if (!Number.isFinite(numeric) || numeric < 0) {
    return null;
  }

  return Math.round(numeric * 100);
}

function parseNullableDate(value) {
  const cleaned = cleanString(value, 80);

  if (!cleaned) {
    return null;
  }

  const parsed = new Date(cleaned);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function parseNullableNumber(value) {
  const cleaned = cleanString(value, 40).replace(",", ".");

  if (!cleaned) {
    return null;
  }

  const numeric = Number(cleaned);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
}

function hasSupplierPayload(payload) {
  return Object.entries(payload).some(([key, value]) => {
    if (key === "currency" || key === "source_status") {
      return false;
    }

    return value !== null && value !== "";
  });
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
      "id, order_number, customer_name, customer_whatsapp, total_cents, currency, payment_status, operational_status, assigned_operator, created_at, updated_at"
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
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

export async function getAdminDashboardState({ selectedOrderNumber } = {}) {
  const { isConfigured, supabase } = getAdminSupabaseStatus();

  if (!isConfigured) {
    return {
      isConfigured,
      orders: [],
      selected: null
    };
  }

  const orders = await listAdminOrders({ supabase });
  const selectedOrder =
    selectedOrderNumber ?? orders.find((order) => order.order_number)?.order_number ?? "";

  return {
    isConfigured,
    orders,
    selected: await getAdminOrder({ orderNumber: selectedOrder, supabase })
  };
}

export async function updateAdminOrderOperation(formData) {
  const { isConfigured, supabase } = getAdminSupabaseStatus();

  if (!isConfigured) {
    throw new Error("Configure NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.");
  }

  const orderId = cleanString(formData.get("orderId"), 80);
  const orderNumber = cleanString(formData.get("orderNumber"), 80);
  const paymentStatus = cleanString(formData.get("paymentStatus"), 80);
  const operationalStatus = cleanString(formData.get("operationalStatus"), 80);

  if (!orderId) {
    throw new Error("Pedido invalido.");
  }

  if (!isKnownStatus(paymentStatus, paymentStatuses)) {
    throw new Error("Status de pagamento invalido.");
  }

  if (!isKnownStatus(operationalStatus, operationalStatuses)) {
    throw new Error("Status operacional invalido.");
  }

  const orderPayload = {
    assigned_operator: cleanNullable(formData.get("assignedOperator"), 120),
    internal_notes: cleanNullable(formData.get("orderInternalNotes"), 1800),
    operational_status: operationalStatus,
    payment_status: paymentStatus
  };
  const { error: orderError } = await supabase.from("orders").update(orderPayload).eq("id", orderId);

  if (orderError) {
    throw new Error(orderError.message);
  }

  const paymentProvider = cleanString(formData.get("paymentProvider"), 80) || "manual";
  const { error: paymentError } = await supabase
    .from("payments")
    .update({
      paid_at: paymentStatus === "pagamento_confirmado" ? new Date().toISOString() : null,
      provider: paymentProvider,
      provider_reference: cleanNullable(formData.get("paymentReference"), 180),
      status: paymentStatus
    })
    .eq("order_id", orderId);

  if (paymentError) {
    throw new Error(paymentError.message);
  }

  const sourceStatus = cleanString(formData.get("sourceStatus"), 80) || "nao_comprado";

  if (!isKnownStatus(sourceStatus, supplierSourceStatuses)) {
    throw new Error("Status da origem invalido.");
  }

  let supplierPurchaseId = cleanString(formData.get("supplierPurchaseId"), 80);
  const supplierPayload = {
    carrier: cleanNullable(formData.get("carrier"), 120),
    currency: cleanString(formData.get("supplierCurrency"), 12) || "BRL",
    exchange_rate: parseNullableNumber(formData.get("exchangeRate")),
    internal_channel: cleanNullable(formData.get("internalChannel"), 80),
    internal_notes: cleanNullable(formData.get("supplierNotes"), 1800),
    operational_account: cleanNullable(formData.get("operationalAccount"), 160),
    product_cost_cents: parseMoneyToCents(formData.get("productCost")),
    proof_url: cleanNullable(formData.get("proofUrl"), 600),
    purchased_at: parseNullableDate(formData.get("purchasedAt")),
    shipping_cost_cents: parseMoneyToCents(formData.get("shippingCost")),
    source_eta: cleanNullable(formData.get("sourceEta"), 160),
    source_order_number: cleanNullable(formData.get("sourceOrderNumber"), 180),
    source_product_url: cleanNullable(formData.get("sourceProductUrl"), 900),
    source_status: sourceStatus,
    source_store_name: cleanNullable(formData.get("sourceStoreName"), 180),
    tracking_code: cleanNullable(formData.get("trackingCode"), 180)
  };

  if (supplierPurchaseId) {
    const { error } = await supabase
      .from("supplier_purchases")
      .update(supplierPayload)
      .eq("id", supplierPurchaseId);

    if (error) {
      throw new Error(error.message);
    }
  } else if (hasSupplierPayload(supplierPayload)) {
    const { data, error } = await supabase
      .from("supplier_purchases")
      .insert({
        ...supplierPayload,
        order_id: orderId
      })
      .select("id")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    supplierPurchaseId = data.id;
  }

  const trackingDescription = cleanNullable(formData.get("trackingDescription"), 900);
  const trackingStatus = cleanNullable(formData.get("trackingStatus"), 120);

  if (trackingStatus || trackingDescription) {
    const { error } = await supabase.from("supplier_tracking_events").insert({
      description: trackingDescription,
      event_at: parseNullableDate(formData.get("trackingEventAt")) ?? new Date().toISOString(),
      event_status: trackingStatus ?? operationalStatus,
      location: cleanNullable(formData.get("trackingLocation"), 160),
      order_id: orderId,
      supplier_purchase_id: supplierPurchaseId || null
    });

    if (error) {
      throw new Error(error.message);
    }
  }

  await supabase.from("audit_logs").insert({
    action: "admin_order_updated",
    metadata: {
      operationalStatus,
      orderNumber,
      paymentStatus,
      supplierPurchaseId: supplierPurchaseId || null
    },
    order_id: orderId
  });

  return {
    orderNumber
  };
}
