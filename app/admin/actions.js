"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { clearAdminSession, isAdminSessionValid } from "@/src/admin/admin-auth.js";
import {
  archiveAdminCoupon,
  archiveAdminCatalogProduct,
  upsertAdminCoupon,
  upsertAdminCatalogProduct
} from "@/src/admin/catalog-admin.js";
import {
  createAdminManualOrder,
  setAdminInternalOrderStatus,
  updateAdminOrderOperation
} from "@/src/admin/order-admin.js";
import { moderateOrderReview } from "@/src/reviews/order-reviews.js";
import { revalidateCatalogPaths } from "@/src/catalog/revalidation.js";

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

export async function setAdminInternalOrderStatusAction(formData) {
  const orderNumber = formValue(formData, "orderNumber");

  if (!(await isAdminSessionValid())) {
    redirectWithError("/admin", "Sessao administrativa expirada.");
  }

  if (!(await isSameOriginAdminRequest())) {
    redirectWithError("/admin", "Requisicao administrativa rejeitada.");
  }

  let result;

  try {
    result = await setAdminInternalOrderStatus(formData);
    revalidatePath("/admin");
  } catch (error) {
    const path = orderNumber ? `/admin?pedido=${encodeURIComponent(orderNumber)}` : "/admin";
    redirectWithError(path, error.message);
  }

  const status =
    result.internalOrderStatus === "confirmado" ? "pedido-confirmado" : "pedido-recusado";
  redirect(`/admin?pedido=${encodeURIComponent(result.orderNumber)}&status=${status}`);
}

export async function createAdminOrderAction(formData) {
  if (!(await isAdminSessionValid())) {
    redirectWithError("/admin?novoPedido=1", "Sessao administrativa expirada.");
  }

  if (!(await isSameOriginAdminRequest())) {
    redirectWithError("/admin?novoPedido=1", "Requisicao administrativa rejeitada.");
  }

  let result;

  try {
    result = await createAdminManualOrder(formData);
    revalidatePath("/admin");
  } catch (error) {
    redirectWithError("/admin?novoPedido=1", error.message);
  }

  redirect(`/admin?pedido=${encodeURIComponent(result.orderNumber)}&status=pedido-criado`);
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
    revalidateCatalogPaths([previousSlug, result.slug]);
    revalidatePath("/admin");
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
    revalidateCatalogPaths([result.slug]);
    revalidatePath("/admin");
  } catch (error) {
    redirectWithError("/admin?tab=produtos", error.message);
  }

  redirect("/admin?tab=produtos&status=produto-arquivado");
}

export async function upsertAdminCouponAction(formData) {
  if (!(await isAdminSessionValid())) {
    redirectWithError("/admin?tab=cupons", "Sessao administrativa expirada.");
  }

  if (!(await isSameOriginAdminRequest())) {
    redirectWithError("/admin?tab=cupons", "Requisicao administrativa rejeitada.");
  }

  let result;

  try {
    result = await upsertAdminCoupon(formData);
    revalidateCatalogPaths();
    revalidatePath("/admin");
  } catch (error) {
    redirectWithError("/admin?tab=cupons", error.message);
  }

  redirect(`/admin?tab=cupons&cupom=${encodeURIComponent(result.code)}&status=cupom-salvo`);
}

export async function archiveAdminCouponAction(formData) {
  if (!(await isAdminSessionValid())) {
    redirectWithError("/admin?tab=cupons", "Sessao administrativa expirada.");
  }

  if (!(await isSameOriginAdminRequest())) {
    redirectWithError("/admin?tab=cupons", "Requisicao administrativa rejeitada.");
  }

  try {
    await archiveAdminCoupon(formData);
    revalidateCatalogPaths();
    revalidatePath("/admin");
  } catch (error) {
    redirectWithError("/admin?tab=cupons", error.message);
  }

  redirect("/admin?tab=cupons&status=cupom-arquivado");
}

export async function moderateOrderReviewAction(formData) {
  if (!(await isAdminSessionValid())) {
    redirectWithError("/admin?tab=analise", "Sessao administrativa expirada.");
  }

  if (!(await isSameOriginAdminRequest())) {
    redirectWithError("/admin?tab=analise", "Requisicao administrativa rejeitada.");
  }

  let result;

  try {
    result = await moderateOrderReview({ formData });
    revalidatePath("/admin");
    revalidatePath("/produto/[slug]", "page");

    if (result.productSlug) {
      revalidatePath(`/produto/${result.productSlug}`);
    }
  } catch (error) {
    redirectWithError("/admin?tab=analise", error.message);
  }

  redirect(`/admin?tab=analise&status=avaliacao-${result.status}`);
}
