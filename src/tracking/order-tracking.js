import "server-only";

import { createServiceRoleSupabaseClient } from "@/src/lib/supabase/admin.js";
import {
  customerTrackingSteps,
  getStatusLabel,
  operationalStatuses,
  paymentStatuses
} from "@/src/orders/status.js";

function cleanString(value, maxLength = 200) {
  return String(value ?? "")
    .trim()
    .slice(0, maxLength);
}

function digitsOnly(value) {
  return cleanString(value, 120).replace(/\D/g, "");
}

function contactMatchesOrder(order, contact) {
  const submitted = digitsOnly(contact);

  if (submitted.length < 8) {
    return false;
  }

  const knownValues = [
    order.customer_whatsapp,
    order.customer_phone,
    order.customer_tax_id,
    order.customer_snapshot?.whatsapp,
    order.customer_snapshot?.phone,
    order.customer_snapshot?.taxId
  ]
    .map(digitsOnly)
    .filter((value) => value.length >= 8);

  return knownValues.some(
    (known) =>
      known === submitted ||
      (known.length >= 8 && submitted.endsWith(known)) ||
      (submitted.length >= 8 && known.endsWith(submitted))
  );
}

function buildPublicTimeline(order, trackingEvents) {
  const currentStepIndex = customerTrackingSteps.findIndex(
    (step) => step.id === order.operational_status
  );

  const statusSteps = customerTrackingSteps.map((step, index) => ({
    ...step,
    isActive: step.id === order.operational_status,
    isDone: currentStepIndex >= 0 && index <= currentStepIndex
  }));

  const eventSteps = trackingEvents.map((event) => ({
    description: event.description,
    eventAt: event.event_at ?? event.created_at,
    id: event.id,
    label: getStatusLabel(event.event_status, operationalStatuses),
    location: event.location
  }));
  const currentStep = statusSteps.find((step) => step.isActive) ?? {
    id: order.operational_status,
    isActive: true,
    isDone: true,
    label: getStatusLabel(order.operational_status, operationalStatuses)
  };

  return {
    events: eventSteps,
    currentStep,
    steps: statusSteps
  };
}

function sanitizeSupplierTracking(supplierPurchase) {
  if (!supplierPurchase) {
    return {
      carrier: null,
      sourceEta: null,
      trackingCode: null
    };
  }

  return {
    carrier: supplierPurchase.carrier ?? null,
    sourceEta: supplierPurchase.source_eta ?? null,
    trackingCode: supplierPurchase.tracking_code ?? null
  };
}

export function buildPublicOrderTrackingView({ order, supplierPurchase, trackingEvents }) {
  return {
    tracking: sanitizeSupplierTracking(supplierPurchase),
    timeline: buildPublicTimeline(order, trackingEvents ?? [])
  };
}

export async function findPublicOrderTracking({ contact, orderNumber, supabase }) {
  const client = supabase ?? createServiceRoleSupabaseClient();

  if (!client) {
    return {
      reason: "tracking_not_configured",
      status: "setup-required"
    };
  }

  const cleanOrderNumber = cleanString(orderNumber, 80).toUpperCase();

  if (!cleanOrderNumber || !cleanString(contact, 120)) {
    return {
      reason: "missing-fields",
      status: "empty"
    };
  }

  const { data: order, error } = await client
    .from("orders")
    .select("*")
    .eq("order_number", cleanOrderNumber)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!order || !contactMatchesOrder(order, contact)) {
    return {
      reason: "not-found",
      status: "not-found"
    };
  }

  const [
    { data: items, error: itemsError },
    { data: supplierPurchases, error: supplierError },
    { data: trackingEvents, error: trackingError }
  ] = await Promise.all([
    client
      .from("order_items")
      .select("product_name, variation, quantity")
      .eq("order_id", order.id)
      .order("created_at"),
    client
      .from("supplier_purchases")
      .select("carrier, source_eta, tracking_code")
      .eq("order_id", order.id)
      .order("created_at")
      .limit(1),
    client
      .from("supplier_tracking_events")
      .select("id, event_status, event_at, location, description, created_at")
      .eq("order_id", order.id)
      .order("event_at", { ascending: false })
      .order("created_at", { ascending: false })
  ]);

  const firstError = itemsError ?? supplierError ?? trackingError;

  if (firstError) {
    throw new Error(firstError.message);
  }

  const trackingView = buildPublicOrderTrackingView({
    order,
    supplierPurchase: supplierPurchases?.[0] ?? null,
    trackingEvents: trackingEvents ?? []
  });

  return {
    order: {
      createdAt: order.created_at,
      customerName: order.customer_name,
      items: items ?? [],
      operationalStatus: order.operational_status,
      operationalStatusLabel: getStatusLabel(order.operational_status, operationalStatuses),
      orderNumber: order.order_number,
      paymentStatus: order.payment_status,
      paymentStatusLabel: getStatusLabel(order.payment_status, paymentStatuses),
      shippingEta: order.shipping_eta,
      totalCents: order.total_cents,
      tracking: trackingView.tracking
    },
    status: "found",
    timeline: trackingView.timeline
  };
}
