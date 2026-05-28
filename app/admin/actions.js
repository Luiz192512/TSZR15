"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import {
  clearAdminSession,
  isAdminSessionValid
} from "@/src/admin/admin-auth.js";
import {
  archiveAdminCatalogProduct,
  upsertAdminCatalogProduct
} from "@/src/admin/catalog-admin.js";
import { updateAdminOrderOperation } from "@/src/admin/order-admin.js";

function formValue(formData, key) {
  return String(formData.get(key) ?? "").trim();
}

function redirectWithError(path, message) {
  const separator = path.includes("?") ? "&" : "?";
  redirect(`${path}${separator}error=${encodeURIComponent(message)}`);
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

  let result;

  try {
    result = await updateAdminOrderOperation(formData);
    revalidatePath("/admin");
  } catch (error) {
    const path = orderNumber ? `/admin?pedido=${encodeURIComponent(orderNumber)}` : "/admin";
    redirectWithError(path, error.message);
  }

  redirect(`/admin?pedido=${encodeURIComponent(result.orderNumber)}&status=salvo`);
}

function revalidateCatalogPaths(...slugs) {
  revalidatePath("/");
  revalidatePath("/catalogo");
  revalidatePath("/api/catalog");
  revalidatePath("/admin");
  revalidatePath("/produto/[slug]", "page");

  for (const slug of slugs.filter(Boolean)) {
    revalidatePath(`/produto/${slug}`);
  }
}

export async function upsertAdminProductAction(formData) {
  const previousSlug = formValue(formData, "previousSlug");

  if (!(await isAdminSessionValid())) {
    redirectWithError("/admin?tab=produtos", "Sessao administrativa expirada.");
  }

  if (!(await isSameOriginAdminRequest())) {
    redirectWithError("/admin?tab=produtos", "Requisicao administrativa rejeitada.");
  }

  let result;

  try {
    result = await upsertAdminCatalogProduct(formData);
    revalidateCatalogPaths(previousSlug, result.slug);
  } catch (error) {
    redirectWithError("/admin?tab=produtos", error.message);
  }

  redirect(`/admin?tab=produtos&produto=${encodeURIComponent(result.id)}&status=produto-salvo`);
}

export async function archiveAdminProductAction(formData) {
  if (!(await isAdminSessionValid())) {
    redirectWithError("/admin?tab=produtos", "Sessao administrativa expirada.");
  }

  if (!(await isSameOriginAdminRequest())) {
    redirectWithError("/admin?tab=produtos", "Requisicao administrativa rejeitada.");
  }

  let result;

  try {
    result = await archiveAdminCatalogProduct(formData);
    revalidateCatalogPaths(result.slug);
  } catch (error) {
    redirectWithError("/admin?tab=produtos", error.message);
  }

  redirect("/admin?tab=produtos&status=produto-arquivado");
}
