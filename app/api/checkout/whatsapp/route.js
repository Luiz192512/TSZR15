import {
  buildWhatsAppCheckoutUrl,
} from "@/src/checkout/whatsapp.js";
import {
  buildCheckoutOrderDraft,
  CheckoutPersistenceError,
  CheckoutValidationError,
  persistCheckoutOrder
} from "@/src/checkout/order-backend.js";
import {
  markCouponRedeemed,
  resolveCheckoutCoupon
} from "@/src/checkout/coupons.js";
import { getSupabaseCatalogProducts } from "@/src/catalog/supabase-catalog.js";
import { createServiceRoleSupabaseClient } from "@/src/lib/supabase/admin.js";
import { createServerSupabaseClient } from "@/src/lib/supabase/server.js";

function getRequestContext(request) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const ipAddress = forwardedFor?.split(",")[0]?.trim() || null;

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
    .in("product_id", products.map((product) => product.id));

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
  let payload;

  try {
    payload = await request.json();
  } catch {
    return errorResponse("Envie um JSON valido para finalizar o pedido.", 400);
  }

  const storeName = process.env.NEXT_PUBLIC_STORE_NAME ?? "TSZR15";
  const phoneNumber =
    process.env.WHATSAPP_BUSINESS_NUMBER ??
    process.env.NEXT_PUBLIC_WHATSAPP_BUSINESS_NUMBER ??
    "5511999999999";
  const userSupabase = await createServerSupabaseClient();
  const serviceSupabase = createServiceRoleSupabaseClient();
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

    draft = coupon
      ? buildCheckoutOrderDraft(payload, { coupon, products, storeName })
      : baseDraft;
  } catch (error) {
    if (error instanceof CheckoutValidationError) {
      return errorResponse(error.message, 400, error.details);
    }

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
      return errorResponse(`Nao foi possivel salvar o pedido: ${error.message}`, 500);
    }

    throw error;
  }

  if (order.saved && draft.coupon?.code) {
    await markCouponRedeemed({ code: draft.coupon.code, supabase: serviceSupabase });
  }

  return Response.json({
    channel: "whatsapp-business",
    coupon: draft.coupon,
    message: draft.message,
    order,
    totals: draft.totals,
    whatsappUrl: buildWhatsAppCheckoutUrl({ phoneNumber, message: draft.message })
  }, { status: order.saved ? 201 : 200 });
}
