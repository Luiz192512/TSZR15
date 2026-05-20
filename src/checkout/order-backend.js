import { catalogProducts } from "../catalog/index.js";
import {
  ASSISTED_PURCHASE_CONSENT_TEXT,
  ASSISTED_PURCHASE_CONSENT_VERSION
} from "../customer/customer-data.js";
import {
  buildWhatsAppOrderMessage,
  calculateCartTotals,
  getPaymentMethod,
  getShippingOption
} from "./whatsapp.js";

const MAX_ITEM_QUANTITY = 99;

export class CheckoutValidationError extends Error {
  constructor(message, details = []) {
    super(message);
    this.name = "CheckoutValidationError";
    this.details = details;
  }
}

export class CheckoutPersistenceError extends Error {
  constructor(message) {
    super(message);
    this.name = "CheckoutPersistenceError";
  }
}

function cleanString(value, maxLength = 500) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function getCatalogProduct(productId) {
  return catalogProducts.find(
    (product) => product.id === productId || product.slug === productId
  );
}

function normalizeQuantity(value) {
  const quantity = Number(value);

  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_ITEM_QUANTITY) {
    return null;
  }

  return quantity;
}

function normalizeCartItems(cartItems) {
  if (!Array.isArray(cartItems) || cartItems.length === 0) {
    throw new CheckoutValidationError("Adicione pelo menos um item ao pedido.");
  }

  const itemsByKey = new Map();
  const errors = [];

  for (const item of cartItems) {
    const productId = cleanString(item?.id || item?.productId || item?.slug, 120);
    const product = getCatalogProduct(productId);
    const quantity = normalizeQuantity(item?.quantity);

    if (!product) {
      errors.push(`Produto invalido: ${productId || "sem identificador"}.`);
      continue;
    }

    if (!quantity) {
      errors.push(`${product.name}: quantidade invalida.`);
      continue;
    }

    const variation = cleanString(item?.variation || product.variations[0], 120);

    if (!product.variations.includes(variation)) {
      errors.push(`${product.name}: variacao invalida.`);
      continue;
    }

    const cartKey = `${product.id}:${variation}`;
    const currentItem = itemsByKey.get(cartKey);
    const nextQuantity = (currentItem?.quantity ?? 0) + quantity;

    if (nextQuantity > MAX_ITEM_QUANTITY) {
      errors.push(`${product.name}: quantidade maxima por variacao e ${MAX_ITEM_QUANTITY}.`);
      continue;
    }

    itemsByKey.set(cartKey, {
      bikeModelScope: product.bikeModelScope,
      cartKey,
      checkoutChannel: product.checkoutChannel,
      currency: product.currency,
      id: product.id,
      internalPurchaseSource: product.internalPurchaseSource,
      name: product.name,
      priceCents: product.priceCents,
      productFamily: product.productFamily,
      quantity: nextQuantity,
      slug: product.slug,
      storefrontCategoryIds: product.storefrontCategoryIds,
      variation
    });
  }

  if (errors.length > 0) {
    throw new CheckoutValidationError("Revise os itens do pedido.", errors);
  }

  return Array.from(itemsByKey.values());
}

function normalizeCustomer(customer) {
  return {
    address: cleanString(customer?.address, 1000),
    cep: cleanString(customer?.cep, 20),
    email: cleanString(customer?.email, 320),
    name: cleanString(customer?.name, 200),
    notes: cleanString(customer?.notes, 1000),
    phone: cleanString(customer?.phone, 40),
    taxId: cleanString(customer?.taxId, 40),
    whatsapp: cleanString(customer?.whatsapp, 40)
  };
}

function validateCustomer(customer, hasDataConsent) {
  const errors = [];

  if (!customer.name) {
    errors.push("Informe o nome do cliente.");
  }

  if (!customer.whatsapp && !customer.phone) {
    errors.push("Informe WhatsApp ou telefone.");
  }

  if (!customer.cep) {
    errors.push("Informe o CEP.");
  }

  if (!customer.address) {
    errors.push("Informe o endereco de entrega.");
  }

  if (!hasDataConsent) {
    errors.push("Confirme o consentimento de compra assistida.");
  }

  if (errors.length > 0) {
    throw new CheckoutValidationError("Revise os dados do cliente.", errors);
  }
}

function buildDatabaseItems(cartItems) {
  return cartItems.map((item) => ({
    bikeModelScope: item.bikeModelScope,
    checkoutChannel: item.checkoutChannel,
    currency: item.currency,
    internalPurchaseSource: item.internalPurchaseSource,
    productFamily: item.productFamily,
    productId: item.id,
    productSlug: item.slug,
    quantity: item.quantity,
    storefrontCategoryIds: item.storefrontCategoryIds,
    subtotalCents: item.priceCents * item.quantity,
    unitPriceCents: item.priceCents,
    variation: item.variation,
    name: item.name
  }));
}

function buildAddressSnapshot(customer) {
  return {
    cep: customer.cep,
    line: customer.address
  };
}

function buildConsentSnapshot(hasDataConsent) {
  return {
    accepted: Boolean(hasDataConsent),
    consentText: ASSISTED_PURCHASE_CONSENT_TEXT,
    consentVersion: ASSISTED_PURCHASE_CONSENT_VERSION,
    dataUse: "delivery_and_internal_assisted_purchase"
  };
}

export function buildCheckoutOrderDraft(payload, { storeName = "TSZR15" } = {}) {
  const cartItems = normalizeCartItems(payload?.cartItems);
  const customer = normalizeCustomer(payload?.customer);
  const hasDataConsent = payload?.hasDataConsent === true;

  validateCustomer(customer, hasDataConsent);

  const paymentMethod = getPaymentMethod(payload?.paymentMethodId);
  const shippingOption = getShippingOption(payload?.shippingOptionId);
  const totals = calculateCartTotals(cartItems, shippingOption.id);
  const message = buildWhatsAppOrderMessage({
    cartItems,
    customer,
    paymentMethodId: paymentMethod.id,
    shippingOptionId: shippingOption.id,
    storeName
  });

  return {
    addressSnapshot: buildAddressSnapshot(customer),
    cartItems,
    consentSnapshot: buildConsentSnapshot(hasDataConsent),
    customerSnapshot: customer,
    databaseItems: buildDatabaseItems(cartItems),
    message,
    payment: {
      id: paymentMethod.id,
      label: paymentMethod.label,
      status: "aguardando_pagamento"
    },
    shipping: {
      eta: shippingOption.eta,
      id: shippingOption.id,
      label: shippingOption.label,
      priceCents: shippingOption.priceCents
    },
    totals: {
      currency: "BRL",
      discountCents: totals.discountCents,
      shippingCents: totals.shippingCents,
      subtotalCents: totals.subtotalCents,
      totalCents: totals.totalCents
    }
  };
}

export async function persistCheckoutOrder({ draft, requestContext = {}, supabase, user }) {
  if (!supabase) {
    return {
      reason: "Supabase nao configurado.",
      saved: false
    };
  }

  if (!user && !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return {
      reason: "Pedido de convidado precisa de SUPABASE_SERVICE_ROLE_KEY no servidor.",
      saved: false
    };
  }

  const { data, error } = await supabase.rpc("create_checkout_order", {
    p_address_snapshot: draft.addressSnapshot,
    p_consent_snapshot: draft.consentSnapshot,
    p_customer_snapshot: draft.customerSnapshot,
    p_items: draft.databaseItems,
    p_message: draft.message,
    p_payment: draft.payment,
    p_request_context: requestContext,
    p_shipping: draft.shipping,
    p_totals: draft.totals,
    p_user_id: user?.id ?? null
  });

  if (error) {
    throw new CheckoutPersistenceError(error.message);
  }

  return {
    id: data?.id ?? null,
    operationalStatus: data?.operationalStatus ?? "enviado_whatsapp_business",
    orderNumber: data?.orderNumber ?? null,
    paymentStatus: data?.paymentStatus ?? "aguardando_pagamento",
    saved: true
  };
}
