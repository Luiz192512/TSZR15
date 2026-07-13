export function toPublicCheckoutTotals(totals = {}) {
  return {
    currency: totals.currency ?? "BRL",
    discountCents: totals.discountCents ?? 0,
    shippingCents: totals.shippingCents ?? 0,
    subtotalCents: totals.subtotalCents ?? 0,
    totalCents: totals.totalCents ?? 0
  };
}
