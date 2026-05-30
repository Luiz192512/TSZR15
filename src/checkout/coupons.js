import { CheckoutValidationError } from "./order-backend.js";

export function normalizeCouponCode(value) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, "")
    .slice(0, 40);
}

function cents(value) {
  return Number.isInteger(value) && value > 0 ? value : 0;
}

function hasIntersection(left = [], right = []) {
  const rightSet = new Set(right);
  return left.some((value) => rightSet.has(value));
}

function getDiscountableSubtotal(cartItems, coupon) {
  const productIds = coupon.appliesToProductIds ?? [];
  const categoryIds = coupon.appliesToCategoryIds ?? [];
  const isGlobalCoupon = productIds.length === 0 && categoryIds.length === 0;

  return cartItems.reduce((total, item) => {
    const itemSubtotal = item.priceCents * item.quantity;

    if (isGlobalCoupon) {
      return total + itemSubtotal;
    }

    if (productIds.includes(item.id)) {
      return total + itemSubtotal;
    }

    if (hasIntersection(item.storefrontCategoryIds, categoryIds)) {
      return total + itemSubtotal;
    }

    return total;
  }, 0);
}

export function toCheckoutCoupon(row, cartItems, now = new Date()) {
  const code = normalizeCouponCode(row?.code);

  if (!code) {
    throw new CheckoutValidationError("Cupom invalido.");
  }

  if (row.is_active === false) {
    throw new CheckoutValidationError("Cupom inativo.");
  }

  if (row.starts_at && new Date(row.starts_at) > now) {
    throw new CheckoutValidationError("Cupom ainda nao esta ativo.");
  }

  if (row.expires_at && new Date(row.expires_at) < now) {
    throw new CheckoutValidationError("Cupom expirado.");
  }

  if (
    Number.isInteger(row.max_redemptions) &&
    Number.isInteger(row.redemption_count) &&
    row.redemption_count >= row.max_redemptions
  ) {
    throw new CheckoutValidationError("Cupom ja atingiu o limite de uso.");
  }

  const coupon = {
    appliesToCategoryIds: row.applies_to_category_ids ?? [],
    appliesToProductIds: row.applies_to_product_ids ?? [],
    code,
    description: row.description ?? "",
    discountCents: cents(row.discount_cents),
    discountPercent: Number.isInteger(row.discount_percent) ? row.discount_percent : null,
    discountType: row.discount_type
  };
  const discountableSubtotalCents = getDiscountableSubtotal(cartItems, coupon);
  const minimumSubtotalCents = cents(row.minimum_subtotal_cents);

  if (minimumSubtotalCents > 0 && discountableSubtotalCents < minimumSubtotalCents) {
    throw new CheckoutValidationError(
      `Cupom disponivel a partir de ${new Intl.NumberFormat("pt-BR", {
        currency: "BRL",
        style: "currency"
      }).format(minimumSubtotalCents / 100)} em produtos aplicaveis.`
    );
  }

  if (discountableSubtotalCents <= 0) {
    throw new CheckoutValidationError("Cupom nao se aplica aos itens do carrinho.");
  }

  if (coupon.discountType === "percent" && Number.isInteger(coupon.discountPercent)) {
    coupon.discountCents = Math.round(
      (discountableSubtotalCents * coupon.discountPercent) / 100
    );
  }

  coupon.discountCents = Math.min(coupon.discountCents, discountableSubtotalCents);

  if (coupon.discountCents <= 0) {
    throw new CheckoutValidationError("Cupom sem desconto valido.");
  }

  return coupon;
}

export async function resolveCheckoutCoupon({ cartItems, code, now = new Date(), supabase }) {
  const normalizedCode = normalizeCouponCode(code);

  if (!normalizedCode) {
    return null;
  }

  if (!supabase) {
    throw new CheckoutValidationError("Cupons indisponiveis no momento.");
  }

  const { data, error } = await supabase
    .from("catalog_coupons")
    .select("*")
    .eq("code", normalizedCode)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new CheckoutValidationError("Cupom nao encontrado.");
  }

  return toCheckoutCoupon(data, cartItems, now);
}

export async function markCouponRedeemed({ code, supabase }) {
  const normalizedCode = normalizeCouponCode(code);

  if (!normalizedCode || !supabase) {
    return;
  }

  await supabase.rpc("redeem_catalog_coupon", { p_code: normalizedCode });
}
