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
import { isSameOriginRequest } from "@/src/security/origin.js";

function formValue(formData, key) {
  return String(formData.get(key) ?? "").trim();
}

function redirectWithError(path, message) {
  const separator = path.includes("?") ? "&" : "?";
  redirect(`${path}${separator}error=${encodeURIComponent(message)}`);
}

function revalidateAdminPanel() {
  revalidatePath("/admin", "layout");
}

function getActionErrorMessage(error) {
  return error instanceof Error ? error.message : "Nao foi possivel salvar o produto.";
}

async function isSameOriginAdminRequest() {
  const headerStore = await headers();

  return isSameOriginRequest(headerStore);
}

export async function adminSignOutAction() {
  if (!(await isAdminSessionValid()) || !(await isSameOriginAdminRequest())) {
    redirect("/entrar?next=/admin");
  }

  await clearAdminSession();
  redirect("/entrar?next=/admin");
}

export async function updateAdminOrderAction(formData) {
  const orderNumber = formValue(formData, "orderNumber");

  if (!(await isAdminSessionValid())) {
    redirectWithError("/admin/pedidos", "Sessao administrativa expirada.");
  }

  if (!(await isSameOriginAdminRequest())) {
    redirectWithError("/admin/pedidos", "Requisicao administrativa rejeitada.");
  }

  let result;

  try {
    result = await updateAdminOrderOperation(formData);
    revalidateAdminPanel();
  } catch (error) {
    const path = orderNumber
      ? `/admin/pedidos?pedido=${encodeURIComponent(orderNumber)}`
      : "/admin/pedidos";
    redirectWithError(path, error.message);
  }

  redirect(`/admin/pedidos?pedido=${encodeURIComponent(result.orderNumber)}&status=salvo`);
}

export async function setAdminInternalOrderStatusAction(formData) {
  const orderNumber = formValue(formData, "orderNumber");

  if (!(await isAdminSessionValid())) {
    redirectWithError("/admin/pedidos", "Sessao administrativa expirada.");
  }

  if (!(await isSameOriginAdminRequest())) {
    redirectWithError("/admin/pedidos", "Requisicao administrativa rejeitada.");
  }

  let result;

  try {
    result = await setAdminInternalOrderStatus(formData);
    revalidateAdminPanel();
  } catch (error) {
    const path = orderNumber
      ? `/admin/pedidos?pedido=${encodeURIComponent(orderNumber)}`
      : "/admin/pedidos";
    redirectWithError(path, error.message);
  }

  const status =
    result.internalOrderStatus === "confirmado" ? "pedido-confirmado" : "pedido-recusado";
  redirect(`/admin/pedidos?pedido=${encodeURIComponent(result.orderNumber)}&status=${status}`);
}

export async function createAdminOrderAction(formData) {
  if (!(await isAdminSessionValid())) {
    redirectWithError("/admin/pedidos?novoPedido=1", "Sessao administrativa expirada.");
  }

  if (!(await isSameOriginAdminRequest())) {
    redirectWithError("/admin/pedidos?novoPedido=1", "Requisicao administrativa rejeitada.");
  }

  let result;

  try {
    result = await createAdminManualOrder(formData);
    revalidateAdminPanel();
  } catch (error) {
    redirectWithError("/admin/pedidos?novoPedido=1", error.message);
  }

  redirect(`/admin/pedidos?pedido=${encodeURIComponent(result.orderNumber)}&status=pedido-criado`);
}

export async function upsertAdminProductAction(_previousState, formData) {
  const previousSlug = formValue(formData, "previousSlug");

  if (!(await isAdminSessionValid())) {
    return { error: "Sessao administrativa expirada." };
  }

  if (!(await isSameOriginAdminRequest())) {
    return { error: "Requisicao administrativa rejeitada." };
  }

  let result;

  try {
    result = await upsertAdminCatalogProduct(formData);
    revalidateCatalogPaths([previousSlug, result.slug]);
    revalidateAdminPanel();
  } catch (error) {
    return { error: getActionErrorMessage(error) };
  }

  redirect(`/admin/produtos?produto=${encodeURIComponent(result.id)}&status=produto-salvo`);
}

export async function archiveAdminProductAction(formData) {
  if (!(await isAdminSessionValid())) {
    redirectWithError("/admin/produtos", "Sessao administrativa expirada.");
  }

  if (!(await isSameOriginAdminRequest())) {
    redirectWithError("/admin/produtos", "Requisicao administrativa rejeitada.");
  }

  let result;

  try {
    result = await archiveAdminCatalogProduct(formData);
    revalidateCatalogPaths([result.slug]);
    revalidateAdminPanel();
  } catch (error) {
    redirectWithError("/admin/produtos", error.message);
  }

  redirect("/admin/produtos?status=produto-arquivado");
}

export async function upsertAdminCouponAction(formData) {
  if (!(await isAdminSessionValid())) {
    redirectWithError("/admin/cupons", "Sessao administrativa expirada.");
  }

  if (!(await isSameOriginAdminRequest())) {
    redirectWithError("/admin/cupons", "Requisicao administrativa rejeitada.");
  }

  let result;

  try {
    result = await upsertAdminCoupon(formData);
    revalidateCatalogPaths();
    revalidateAdminPanel();
  } catch (error) {
    redirectWithError("/admin/cupons", error.message);
  }

  redirect(`/admin/cupons?cupom=${encodeURIComponent(result.code)}&status=cupom-salvo`);
}

export async function archiveAdminCouponAction(formData) {
  if (!(await isAdminSessionValid())) {
    redirectWithError("/admin/cupons", "Sessao administrativa expirada.");
  }

  if (!(await isSameOriginAdminRequest())) {
    redirectWithError("/admin/cupons", "Requisicao administrativa rejeitada.");
  }

  try {
    await archiveAdminCoupon(formData);
    revalidateCatalogPaths();
    revalidateAdminPanel();
  } catch (error) {
    redirectWithError("/admin/cupons", error.message);
  }

  redirect("/admin/cupons?status=cupom-arquivado");
}

export async function moderateOrderReviewAction(formData) {
  if (!(await isAdminSessionValid())) {
    redirectWithError("/admin/analise", "Sessao administrativa expirada.");
  }

  if (!(await isSameOriginAdminRequest())) {
    redirectWithError("/admin/analise", "Requisicao administrativa rejeitada.");
  }

  let result;

  try {
    result = await moderateOrderReview({ formData });
    revalidateAdminPanel();
    revalidatePath("/produto/[slug]", "page");

    if (result.productSlug) {
      revalidatePath(`/produto/${result.productSlug}`);
    }
  } catch (error) {
    redirectWithError("/admin/analise", error.message);
  }

  redirect(`/admin/analise?status=avaliacao-${result.status}`);
}
