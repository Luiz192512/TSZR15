"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import {
  clearAdminSession,
  isAdminSessionValid
} from "@/src/admin/admin-auth.js";
import { updateAdminOrderOperation } from "@/src/admin/order-admin.js";

function formValue(formData, key) {
  return String(formData.get(key) ?? "").trim();
}

function redirectWithError(path, message) {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

async function isSameOriginAdminRequest() {
  const headerStore = await headers();
  const origin = headerStore.get("origin");
  const host = headerStore.get("host");

  if (!origin || !host) {
    return true;
  }

  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function adminSignOutAction() {
  if (!(await isSameOriginAdminRequest())) {
    redirect("/entrar?next=/admin");
  }

  await clearAdminSession();
  redirect("/entrar?next=/admin");
}

export async function updateAdminOrderAction(formData) {
  const orderNumber = formValue(formData, "orderNumber");

  if (!(await isAdminSessionValid())) {
    redirectWithError("/admin", "Sessao administrativa expirada.");
  }

  if (!(await isSameOriginAdminRequest())) {
    redirectWithError("/admin", "Requisicao administrativa rejeitada.");
  }

  try {
    const result = await updateAdminOrderOperation(formData);
    revalidatePath("/admin");
    redirect(`/admin?pedido=${encodeURIComponent(result.orderNumber)}&status=salvo`);
  } catch (error) {
    const path = orderNumber ? `/admin?pedido=${encodeURIComponent(orderNumber)}` : "/admin";
    redirectWithError(path, error.message);
  }
}
