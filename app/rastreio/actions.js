"use server";

import { findPublicOrderTracking } from "@/src/tracking/order-tracking.js";

export async function lookupOrderTracking(_previousState, formData) {
  const contact = formData.get("contato");
  const orderNumber = formData.get("pedido");

  try {
    return await findPublicOrderTracking({ contact, orderNumber });
  } catch (error) {
    return {
      message: error instanceof Error ? error.message : "Falha ao consultar o rastreio.",
      status: "setup-required"
    };
  }
}
