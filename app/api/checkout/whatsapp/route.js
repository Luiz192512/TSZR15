import {
  buildWhatsAppCheckoutUrl,
} from "@/src/checkout/whatsapp.js";
import {
  buildCheckoutOrderDraft,
  CheckoutPersistenceError,
  CheckoutValidationError,
  persistCheckoutOrder
} from "@/src/checkout/order-backend.js";
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

  let draft;

  try {
    const catalog = await getSupabaseCatalogProducts();
    draft = buildCheckoutOrderDraft(payload, { products: catalog.products, storeName });
  } catch (error) {
    if (error instanceof CheckoutValidationError) {
      return errorResponse(error.message, 400, error.details);
    }

    throw error;
  }

  const userSupabase = await createServerSupabaseClient();
  const serviceSupabase = createServiceRoleSupabaseClient();
  const supabase = serviceSupabase ?? userSupabase;
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

  return Response.json({
    channel: "whatsapp-business",
    message: draft.message,
    order,
    totals: draft.totals,
    whatsappUrl: buildWhatsAppCheckoutUrl({ phoneNumber, message: draft.message })
  }, { status: order.saved ? 201 : 200 });
}
