export const paymentMethods = [
  { id: "pix", label: "Pix" },
  { id: "cartao", label: "Cartao" },
  { id: "dinheiro", label: "Dinheiro" },
  { id: "combinar", label: "Combinar no atendimento" }
];

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

export function calculateCartTotals(cartItems, shippingOptionId = "combinar") {
  const subtotalCents = cartItems.reduce(
    (total, item) => total + item.priceCents * item.quantity,
    0
  );
  const shippingOption = getShippingOption(shippingOptionId);
  const discountCents = 0;
  const totalCents = subtotalCents - discountCents + shippingOption.priceCents;

  return {
    subtotalCents,
    discountCents,
    shippingCents: shippingOption.priceCents,
    totalCents,
    shippingOption
  };
}

export function buildWhatsAppOrderMessage({
  cartItems,
  customer,
  paymentMethodId,
  shippingOptionId,
  storeName = "TSZR15"
}) {
  const paymentMethod = getPaymentMethod(paymentMethodId);
  const totals = calculateCartTotals(cartItems, shippingOptionId);
  const itemLines = cartItems.map((item) => {
    const subtotal = item.priceCents * item.quantity;
    return `- ${item.name} | Variacao: ${item.variation} | Qtd: ${item.quantity} | Unit.: ${formatCurrency(item.priceCents)} | Subtotal: ${formatCurrency(subtotal)}`;
  });

  return [
    `Ola, quero fechar meu pedido ${storeName}.`,
    "",
    "Itens:",
    ...itemLines,
    "",
    `Subtotal: ${formatCurrency(totals.subtotalCents)}`,
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
