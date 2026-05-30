import { getSupabaseCatalogProducts } from "@/src/catalog/supabase-catalog.js";
import {
  CheckoutValidationError,
  normalizeCheckoutCartItems
} from "@/src/checkout/order-backend.js";
import { calculateCartTotals } from "@/src/checkout/whatsapp.js";
import { resolveCheckoutCoupon } from "@/src/checkout/coupons.js";
import { createServiceRoleSupabaseClient } from "@/src/lib/supabase/admin.js";

function errorResponse(message, status, details = []) {
  return Response.json(
    {
      details,
      error: message
    },
    { status }
  );
}

export async function POST(request) {
  let payload;

  try {
    payload = await request.json();
  } catch {
    return errorResponse("Envie um JSON valido para validar o cupom.", 400);
  }

  const supabase = createServiceRoleSupabaseClient();

  if (!supabase) {
    return errorResponse("Cupons indisponiveis no momento.", 503);
  }

  try {
    const catalog = await getSupabaseCatalogProducts();
    const cartItems = normalizeCheckoutCartItems(payload?.cartItems, catalog.products);
    const coupon = await resolveCheckoutCoupon({
      cartItems,
      code: payload?.couponCode,
      supabase
    });
    const totals = calculateCartTotals(cartItems, payload?.shippingOptionId, {
      discountCents: coupon?.discountCents ?? 0
    });

    return Response.json({
      coupon,
      totals: {
        currency: "BRL",
        discountCents: totals.discountCents,
        shippingCents: totals.shippingCents,
        subtotalCents: totals.subtotalCents,
        totalCents: totals.totalCents
      }
    });
  } catch (error) {
    if (error instanceof CheckoutValidationError) {
      return errorResponse(error.message, 400, error.details);
    }

    throw error;
  }
}
