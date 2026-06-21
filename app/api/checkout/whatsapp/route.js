import { buildWhatsAppCheckoutUrl } from "@/src/checkout/whatsapp.js";
import { sendOrderConfirmation } from "@/src/checkout/order-email.js";
import {
  buildCheckoutOrderDraft,
  CheckoutPersistenceError,
  CheckoutValidationError,
  persistCheckoutOrder
} from "@/src/checkout/order-backend.js";
import { markCouponRedeemed, resolveCheckoutCoupon } from "@/src/checkout/coupons.js";
import { getSupabaseCatalogProducts } from "@/src/catalog/supabase-catalog.js";
import { getVariationStockStatus } from "@/src/catalog/stock.js";
import { logServerEvent } from "@/src/lib/logger.js";
import { captureServerError } from "@/src/lib/monitoring.js";
import { consumeRateLimit, getRequestIp, rateLimitProfiles } from "@/src/lib/rate-limit.js";
import { createRateLimitResponse } from "@/src/lib/rate-limit-response.js";
import { createServiceRoleSupabaseClient } from "@/src/lib/supabase/admin.js";
import { createServerSupabaseClient } from "@/src/lib/supabase/server.js";

function getRequestContext(request) {
  const ipAddress = getRequestIp(request);

  return {
    ipAddress,
    userAgent: request.headers.get("user-agent")
  };
}

function errorResponse(message, status, details = []) {
  return Response.json(
    {
      details,
      error: message
    },
    { status }
  );
}

async function attachInternalProductCosts(products, supabase) {
  if (!supabase || products.length === 0) {
    return products;
  }

  const { data, error } = await supabase
    .from("catalog_product_costs")
    .select("product_id, cost_cents")
    .in(
      "product_id",
      products.map((product) => product.id)
    );

  if (error) {
    throw new Error(error.message);
  }

  const costsByProductId = new Map((data ?? []).map((row) => [row.product_id, row.cost_cents]));

  return products.map((product) => ({
    ...product,
    costCents: costsByProductId.get(product.id) ?? null
  }));
}

export async function POST(request) {
  const serviceSupabase = createServiceRoleSupabaseClient();
  const rateLimit = await consumeRateLimit({
    ...rateLimitProfiles.checkout,
    identifier: getRequestIp(request),
    supabase: serviceSupabase
  });

  if (!rateLimit.allowed) {
    logServerEvent("warn", "checkout_rate_limit_blocked", {
      retryAfterSeconds: rateLimit.retryAfterSeconds,
      unavailable: rateLimit.unavailable
    });

    return createRateLimitResponse(rateLimit, {
      rateLimitedMessage: "Muitas tentativas de checkout. Tente novamente em instantes."
    });
  }

  let payload;

  try {
    payload = await request.json();
  } catch {
    logServerEvent("warn", "checkout_validation_error", {
      reason: "invalid_json"
    });
    return errorResponse("Envie um JSON valido para finalizar o pedido.", 400);
  }

  const storeName = process.env.NEXT_PUBLIC_STORE_NAME ?? "TSZR15";
  const phoneNumber =
    process.env.WHATSAPP_BUSINESS_NUMBER ??
    process.env.NEXT_PUBLIC_WHATSAPP_BUSINESS_NUMBER ??
    "5511999999999";
  const userSupabase = await createServerSupabaseClient();
  const supabase = serviceSupabase ?? userSupabase;

  let draft;

  try {
    const catalog = await getSupabaseCatalogProducts();
    const products = await attachInternalProductCosts(catalog.products, serviceSupabase);
    const baseDraft = buildCheckoutOrderDraft(payload, { products, storeName });
    const coupon = await resolveCheckoutCoupon({
      cartItems: baseDraft.cartItems,
      code: payload?.couponCode,
      supabase: serviceSupabase
    });

    draft = coupon ? buildCheckoutOrderDraft(payload, { coupon, products, storeName }) : baseDraft;

    const unavailableItems = draft.cartItems.filter((item) => {
      const stock = getVariationStockStatus(
        products.find((product) => product.id === item.id),
        item.variation
      );

      return !stock.canAddToCart || (stock.quantity !== null && item.quantity > stock.quantity);
    });

    if (unavailableItems.length > 0) {
      return errorResponse(
        "Uma ou mais variações ficaram esgotadas antes de finalizar o pedido.",
        409,
        unavailableItems.map((item) => `${item.name} (${item.variation})`)
      );
    }
  } catch (error) {
    if (error instanceof CheckoutValidationError) {
      logServerEvent("warn", "checkout_validation_error", {
        details: error.details,
        reason: error.message
      });
      return errorResponse(error.message, 400, error.details);
    }

    logServerEvent("error", "checkout_unhandled_build_error", {
      reason: error instanceof Error ? error.message : "unknown"
    });
    await captureServerError(error, { stage: "checkout-build" });
    throw error;
  }
  const {
    data: { user }
  } = userSupabase ? await userSupabase.auth.getUser() : { data: { user: null } };

  let order;

  try {
    order = await persistCheckoutOrder({
      draft,
      requestContext: getRequestContext(request),
      supabase,
      user
    });
  } catch (error) {
    if (error instanceof CheckoutPersistenceError) {
      logServerEvent("error", "checkout_persistence_error", {
        reason: error.message
      });
      return errorResponse(`Nao foi possivel salvar o pedido: ${error.message}`, 500);
    }

    logServerEvent("error", "checkout_unhandled_persistence_error", {
      reason: error instanceof Error ? error.message : "unknown"
    });
    await captureServerError(error, { stage: "checkout-persistence" });
    throw error;
  }

  if (order.saved && draft.coupon?.code) {
    await markCouponRedeemed({ code: draft.coupon.code, supabase: serviceSupabase });
  }

  if (order.saved) {
    try {
      await sendOrderConfirmation({ draft, order });
    } catch (error) {
      logServerEvent("error", "checkout_confirmation_email_failed", {
        orderNumber: order.orderNumber,
        reason: error instanceof Error ? error.message : "unknown"
      });
      await captureServerError(error, { orderNumber: order.orderNumber, stage: "checkout-email" });
    }
  }

  logServerEvent(order.saved ? "info" : "warn", "checkout_order_processed", {
    orderNumber: order.orderNumber,
    orderSaved: order.saved,
    reason: order.reason
  });

  return Response.json(
    {
      channel: "whatsapp-business",
      coupon: draft.coupon,
      message: draft.message,
      order,
      totals: draft.totals,
      whatsappUrl: buildWhatsAppCheckoutUrl({ phoneNumber, message: draft.message })
    },
    { status: order.saved ? 201 : 200 }
  );
}
