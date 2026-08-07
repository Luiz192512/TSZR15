import { createAdminDatabaseError } from "./admin-action-error.js";
import {
  parseAdminDateTimeInput,
  parseAdminMoneyToCents,
} from "./admin-form-values.js";
import {
  isKnownStatus,
  operationalStatuses,
  paymentStatuses,
  supplierSourceStatuses,
} from "../orders/status.js";

function cleanString(value, maxLength = 500) {
  return String(value ?? "")
    .trim()
    .slice(0, maxLength);
}

function cleanNullable(value, maxLength = 500) {
  return cleanString(value, maxLength) || null;
}

function parseOptionalMoney(formData, key, label) {
  const rawValue = cleanString(formData.get(key), 40);

  if (!rawValue) {
    return null;
  }

  const cents = parseAdminMoneyToCents(rawValue, { allowZero: true });

  if (!Number.isInteger(cents)) {
    throw new Error(`Informe ${label} valido.`);
  }

  return cents;
}

function parseOptionalDate(formData, key, label) {
  const rawValue = cleanString(formData.get(key), 80);

  if (!rawValue) {
    return null;
  }

  const value = parseAdminDateTimeInput(rawValue);

  if (!value) {
    throw new Error(`Informe ${label} valida no horario de Brasilia.`);
  }

  return value;
}

function parseOptionalNumber(value) {
  const cleaned = cleanString(value, 40).replace(",", ".");

  if (!cleaned) {
    return null;
  }

  const numeric = Number(cleaned);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
}

function hasSupplierPayload(payload) {
  return Object.entries(payload).some(([key, value]) => {
    if (key === "currency") {
      return false;
    }

    if (key === "sourceStatus") {
      return value !== "nao_comprado";
    }

    return value !== null && value !== "";
  });
}

export function buildAdminOrderOperationRpcArgs(formData) {
  const orderId = cleanString(formData.get("orderId"), 80);
  const orderNumber = cleanString(formData.get("orderNumber"), 80);
  const operationId = cleanString(formData.get("operationId"), 80);
  const paymentStatus = cleanString(formData.get("paymentStatus"), 80);
  const operationalStatus = cleanString(formData.get("operationalStatus"), 80);
  const sourceStatus =
    cleanString(formData.get("sourceStatus"), 80) || "nao_comprado";
  const trackingStatus = cleanNullable(formData.get("trackingStatus"), 120);

  if (!orderId) {
    throw new Error("Pedido invalido.");
  }

  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      operationId,
    )
  ) {
    throw new Error("Identificador da operacao invalido.");
  }

  if (!isKnownStatus(paymentStatus, paymentStatuses)) {
    throw new Error("Status de pagamento invalido.");
  }

  if (!isKnownStatus(operationalStatus, operationalStatuses)) {
    throw new Error("Status operacional invalido.");
  }

  if (!isKnownStatus(sourceStatus, supplierSourceStatuses)) {
    throw new Error("Status da origem invalido.");
  }

  const supplierPurchaseId = cleanNullable(
    formData.get("supplierPurchaseId"),
    80,
  );
  const supplier = {
    carrier: cleanNullable(formData.get("carrier"), 120),
    currency: cleanString(formData.get("supplierCurrency"), 12) || "BRL",
    exchangeRate: parseOptionalNumber(formData.get("exchangeRate")),
    internalChannel: cleanNullable(formData.get("internalChannel"), 80),
    internalNotes: cleanNullable(formData.get("supplierNotes"), 1800),
    operationalAccount: cleanNullable(formData.get("operationalAccount"), 160),
    productCostCents: parseOptionalMoney(
      formData,
      "productCost",
      "um custo de produto",
    ),
    proofUrl: cleanNullable(formData.get("proofUrl"), 600),
    purchasedAt: parseOptionalDate(
      formData,
      "purchasedAt",
      "uma data da compra",
    ),
    shippingCostCents: parseOptionalMoney(
      formData,
      "shippingCost",
      "um custo de frete",
    ),
    sourceEta: cleanNullable(formData.get("sourceEta"), 160),
    sourceOrderNumber: cleanNullable(formData.get("sourceOrderNumber"), 180),
    sourceProductUrl: cleanNullable(formData.get("sourceProductUrl"), 900),
    sourceStatus,
    sourceStoreName: cleanNullable(formData.get("sourceStoreName"), 180),
    trackingCode: cleanNullable(formData.get("trackingCode"), 180),
  };
  const trackingDescription = cleanNullable(
    formData.get("trackingDescription"),
    900,
  );
  const trackingLocation = cleanNullable(formData.get("trackingLocation"), 160);
  const trackingEventAt = parseOptionalDate(
    formData,
    "trackingEventAt",
    "uma data do rastreio",
  );
  const tracking =
    trackingStatus || trackingDescription || trackingEventAt || trackingLocation
      ? {
          description: trackingDescription,
          eventAt: trackingEventAt,
          location: trackingLocation,
          status: trackingStatus || operationalStatus,
        }
      : null;

  return {
    p_order: {
      assignedOperator: cleanNullable(formData.get("assignedOperator"), 120),
      internalNotes: cleanNullable(formData.get("orderInternalNotes"), 1800),
      operationalStatus,
      paymentStatus,
    },
    p_order_id: orderId,
    p_order_number: orderNumber,
    p_operation_id: operationId,
    p_payment: {
      provider: cleanString(formData.get("paymentProvider"), 80) || "manual",
      providerReference: cleanNullable(formData.get("paymentReference"), 180),
    },
    p_supplier:
      supplierPurchaseId || hasSupplierPayload(supplier) ? supplier : null,
    p_supplier_purchase_id: supplierPurchaseId,
    p_tracking: tracking,
  };
}

export async function saveAdminOrderOperation({ args, supabase }) {
  const { data, error } = await supabase.rpc(
    "save_admin_order_operation",
    args,
  );

  if (error) {
    throw createAdminDatabaseError(error, "salvar operacao do pedido");
  }

  if (!data?.orderNumber) {
    throw new Error("O banco nao retornou o pedido atualizado.");
  }

  return {
    orderNumber: data.orderNumber,
    supplierPurchaseId: data.supplierPurchaseId ?? null,
  };
}
