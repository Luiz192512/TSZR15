"use server";

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

export async function adminSignOutAction() {
  await clearAdminSession();
  redirect("/entrar?next=/admin");
}

export async function updateAdminOrderAction(formData) {
  const orderNumber = formValue(formData, "orderNumber");

  if (!(await isAdminSessionValid())) {
    redirectWithError("/admin", "Sessao administrativa expirada.");
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
