import "server-only";

import { createServiceRoleSupabaseClient } from "@/src/lib/supabase/admin.js";
import { contactMatchesOrder } from "@/src/customer/order-contact.js";
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

/**
 * O que o cliente pode ver dos envios.
 *
 * O CODIGO DE RASTREIO NAO SAI DAQUI. Ele e do fornecedor: rastrea-lo mostra
 * "Shopee" ou "AliExpress" na transportadora, o remetente e o endereco de
 * origem. O cliente acompanha pelo status da loja — que e o vocabulario de
 * `customerTrackingSteps`, nao o do fornecedor.
 *
 * A coluna tambem nao entra na projecao da consulta, e nao e removida aqui: o
 * valor nunca chega a existir na memoria do servidor, entao nenhum log, erro
 * serializado ou prop de componente pode derruba-lo por acidente.
 *
 * Recebe uma LISTA porque um pedido pode ter uma compra por loja. Transportadora
 * e prazo so aparecem quando todas concordam: valores diferentes revelariam que
 * o pedido veio de dois fornecedores.
 */
function sanitizeSupplierTracking(supplierPurchases) {
  const compras = supplierPurchases ?? [];

  if (!compras.length) {
    return { carrier: null, shipmentCount: 0, sourceEta: null };
  }

  const consenso = (campo) => {
    const valores = new Set(compras.map((compra) => compra?.[campo] ?? null));

    return valores.size === 1 ? [...valores][0] : null;
  };

  return {
    carrier: consenso("carrier"),
    shipmentCount: compras.length,
    sourceEta: consenso("source_eta")
  };
}

export function buildPublicOrderTrackingView({ order, supplierPurchases, trackingEvents }) {
  return {
    tracking: sanitizeSupplierTracking(supplierPurchases),
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
      .select("product_name, variation, size, quantity")
      .eq("order_id", order.id)
      .order("created_at"),
    client
      .from("supplier_purchases")
      // `tracking_code` FORA da projecao, e sem `.limit(1)`: um pedido tem uma
      // compra por loja, e mostrar so a primeira dava o rastreio de um envio
      // como se fosse do pedido inteiro.
      .select("carrier, source_eta")
      .eq("order_id", order.id)
      .order("created_at"),
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
    supplierPurchases: supplierPurchases ?? [],
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
