// `online: true` marca o que a tela de pagamento resolve sozinha. O resto
// continua terminando no WhatsApp — "combinar" e "dinheiro" existem justamente
// para quem nao quer pagar pelo site, e esse fluxo nao pode quebrar.
export const paymentMethods = [
  { id: "pix", label: "Pix", online: true },
  { id: "cartao", label: "Cartao", online: true },
  { id: "boleto", label: "Boleto", online: true },
  { id: "dinheiro", label: "Dinheiro" },
  { id: "combinar", label: "Combinar no atendimento" }
];

/**
 * Formas de pagamento oferecidas ao cliente.
 *
 * Boleto so aparece com o pagamento online LIGADO: ele existe porque o provedor
 * emite. Com o fluxo desligado, oferecer boleto criaria trabalho manual que o
 * operador nunca combinou de fazer. Pix, cartao e dinheiro ja eram combinados
 * no atendimento antes do pagamento online e continuam na lista dos dois jeitos.
 */
export function listPaymentMethods({ isOnlinePaymentEnabled = false } = {}) {
  if (isOnlinePaymentEnabled) {
    return paymentMethods;
  }

  return paymentMethods.filter((paymentMethod) => paymentMethod.id !== "boleto");
}

export function isOnlinePaymentMethod(paymentMethodId) {
  return paymentMethods.some(
    (paymentMethod) => paymentMethod.id === paymentMethodId && paymentMethod.online === true
  );
}

export const shippingOptions = [
  {
    id: "combinar",
    label: "Combinar frete no atendimento",
    priceCents: 0,
    eta: "a confirmar"
  },
  {
    id: "pac-estimado",
    label: "PAC estimado",
    priceCents: 3200,
    eta: "5 dias uteis"
  },
  {
    id: "sedex-estimado",
    label: "Sedex estimado",
    priceCents: 4800,
    eta: "2 dias uteis"
  },
  {
    id: "retirada",
    label: "Retirada ou entrega combinada",
    priceCents: 0,
    eta: "combinar"
  }
];

export function formatCurrency(cents) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format((cents ?? 0) / 100);
}

export function normalizePhoneNumber(value) {
  return String(value ?? "").replace(/\D/g, "");
}

export function getPaymentMethod(paymentMethodId) {
  return (
    paymentMethods.find((paymentMethod) => paymentMethod.id === paymentMethodId) ??
    paymentMethods[0]
  );
}

export function getShippingOption(shippingOptionId) {
  return (
    shippingOptions.find((shippingOption) => shippingOption.id === shippingOptionId) ??
    shippingOptions[0]
  );
}

export function calculateCartTotals(
  cartItems,
  shippingOptionId = "combinar",
  { discountCents = 0 } = {}
) {
  const subtotalCents = cartItems.reduce(
    (total, item) => total + item.priceCents * item.quantity,
    0
  );
  const shippingOption = getShippingOption(shippingOptionId);
  const safeDiscountCents = Math.min(
    subtotalCents,
    Math.max(Number.isInteger(discountCents) ? discountCents : 0, 0)
  );
  const totalCents = subtotalCents - safeDiscountCents + shippingOption.priceCents;

  return {
    subtotalCents,
    discountCents: safeDiscountCents,
    shippingCents: shippingOption.priceCents,
    totalCents,
    shippingOption
  };
}

export function buildWhatsAppOrderMessage({
  cartItems,
  coupon = null,
  customer,
  paymentMethodId,
  shippingOptionId,
  storeName = "TSZR15"
}) {
  const paymentMethod = getPaymentMethod(paymentMethodId);
  const totals = calculateCartTotals(cartItems, shippingOptionId, {
    discountCents: coupon?.discountCents ?? 0
  });
  const itemLines = cartItems.map((item) => {
    const subtotal = item.priceCents * item.quantity;
    const sizeLine = item.size ? ` | Tamanho: ${item.size}` : "";
    return `- ${item.name} | Variacao: ${item.variation}${sizeLine} | Qtd: ${item.quantity} | Unit.: ${formatCurrency(item.priceCents)} | Subtotal: ${formatCurrency(subtotal)}`;
  });

  return [
    `Ola, quero fechar meu pedido ${storeName}.`,
    "",
    "Itens:",
    ...itemLines,
    "",
    `Subtotal: ${formatCurrency(totals.subtotalCents)}`,
    coupon?.code ? `Cupom: ${coupon.code}` : null,
    `Desconto: ${formatCurrency(totals.discountCents)}`,
    `Frete: ${totals.shippingOption.label} - ${totals.shippingOption.eta} - ${formatCurrency(totals.shippingCents)}`,
    `Pagamento escolhido: ${paymentMethod.label}`,
    `Total: ${formatCurrency(totals.totalCents)}`,
    `Compra assistida: a compra e feita com ${storeName}; o prazo pode depender da operacao de entrega.`,
    "",
    `Cliente: ${customer.name || "Nao informado"}`,
    customer.taxId ? `CPF/CNPJ: ${customer.taxId}` : null,
    `Email: ${customer.email || "Nao informado"}`,
    `WhatsApp: ${customer.whatsapp || customer.phone || "Nao informado"}`,
    customer.phone && customer.phone !== customer.whatsapp
      ? `Telefone alternativo: ${customer.phone}`
      : null,
    `CEP: ${customer.cep || "Nao informado"}`,
    `Entrega: ${customer.address || "A combinar"}`,
    customer.notes ? `Observacoes: ${customer.notes}` : null
  ]
    .filter((line) => line !== null && line !== undefined)
    .join("\n");
}

export function buildWhatsAppCheckoutUrl({ phoneNumber, message }) {
  const normalizedPhoneNumber = normalizePhoneNumber(phoneNumber);

  if (!normalizedPhoneNumber) {
    return "";
  }

  return `https://wa.me/${normalizedPhoneNumber}?text=${encodeURIComponent(message)}`;
}
