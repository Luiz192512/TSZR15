"use server";

import { headers } from "next/headers";

import { consumeRateLimit, getRequestIp, rateLimitProfiles } from "@/src/lib/rate-limit.js";
import { createServiceRoleSupabaseClient } from "@/src/lib/supabase/admin.js";
import { findPublicOrderTracking } from "@/src/tracking/order-tracking.js";

export async function lookupOrderTracking(_previousState, formData) {
  const contact = formData.get("contato");
  const orderNumber = formData.get("pedido");
  const headerStore = await headers();
  const supabase = createServiceRoleSupabaseClient();
  const rateLimit = await consumeRateLimit({
    ...rateLimitProfiles.tracking,
    identifier: getRequestIp(headerStore),
    supabase
  });

  if (!rateLimit.allowed) {
    return {
      message: rateLimit.unavailable
        ? "Rastreio temporariamente indisponivel. Tente novamente em instantes."
        : "Muitas consultas de rastreio. Aguarde alguns minutos e tente novamente.",
      retryAfterSeconds: rateLimit.retryAfterSeconds,
      status: "rate-limited"
    };
  }

  try {
    return await findPublicOrderTracking({ contact, orderNumber, supabase });
  } catch (error) {
    return {
      message: error instanceof Error ? error.message : "Falha ao consultar o rastreio.",
      status: "setup-required"
    };
  }
}
