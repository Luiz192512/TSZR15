import { getSupabaseCatalogProducts } from "@/src/catalog/supabase-catalog.js";
import {
  CheckoutValidationError,
  normalizeCheckoutCartItems
} from "@/src/checkout/order-backend.js";
import { calculateCartTotals } from "@/src/checkout/whatsapp.js";
import { resolveCheckoutCoupon } from "@/src/checkout/coupons.js";
import { logServerEvent } from "@/src/lib/logger.js";
import { consumeRateLimit, getRequestIp, rateLimitProfiles } from "@/src/lib/rate-limit.js";
import { createRateLimitResponse } from "@/src/lib/rate-limit-response.js";
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

function normalizeCouponIdentifier(couponCode) {
  return String(couponCode ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, "")
    .slice(0, 40);
}

export async function POST(request) {
  let payload;

  try {
    payload = await request.json();
  } catch {
    logServerEvent("warn", "coupon_validation_error", {
      reason: "invalid_json"
    });
    return errorResponse("Envie um JSON valido para validar o cupom.", 400);
  }

  const supabase = createServiceRoleSupabaseClient();
  const rateLimit = await consumeRateLimit({
    ...rateLimitProfiles.coupon,
    identifier: `${getRequestIp(request)}:${normalizeCouponIdentifier(payload?.couponCode) || "empty"}`,
    supabase
  });

  if (!rateLimit.allowed) {
    logServerEvent("warn", "coupon_rate_limit_blocked", {
      retryAfterSeconds: rateLimit.retryAfterSeconds,
      unavailable: rateLimit.unavailable
    });

    return createRateLimitResponse(rateLimit, {
      rateLimitedMessage: "Muitas tentativas de cupom. Tente novamente em instantes."
    });
  }

  if (!supabase) {
    logServerEvent("error", "coupon_supabase_unavailable");
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

    logServerEvent(coupon ? "info" : "warn", coupon ? "coupon_applied" : "coupon_invalid", {
      code: coupon?.code ?? normalizeCouponIdentifier(payload?.couponCode),
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
      logServerEvent("warn", "coupon_validation_error", {
        details: error.details,
        reason: error.message
      });
      return errorResponse(error.message, 400, error.details);
    }

    logServerEvent("error", "coupon_unhandled_error", {
      reason: error instanceof Error ? error.message : "unknown"
    });
    throw error;
  }
}
