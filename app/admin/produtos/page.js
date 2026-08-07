import globalStyles from "@/app/storefront.module.css";
import { cx } from "@/src/lib/classnames";
import Link from "next/link";
import { redirect } from "next/navigation";

import {
  AdminSectionShell,
  AdminSetup,
  getAdminPage,
  getMessage
} from "@/app/admin/_components/admin-ui.js";
import {
  AdminProducts,
  buildAddProductHref,
  getNewProductCount
} from "@/app/admin/_components/admin-products-view.js";
import { isAdminSessionValid, isAdminTokenConfigured } from "@/src/admin/admin-auth.js";
import { getAdminLoadErrorState } from "@/src/admin/admin-load-error.js";
import { getAdminProductsState } from "@/src/admin/catalog-admin.js";

// Sem export const revalidate: o guard chama cookies(), entao a rota e sempre
// dinamica e o Full Route Cache nunca entra. Ver PR de follow-ups do admin.

export default async function AdminProductsPage({ searchParams }) {
  const params = await searchParams;
  const message = getMessage(params);
  const newProductCount = getNewProductCount(params);
  const productPage = getAdminPage(params, "paginaProdutos");

  if (!isAdminTokenConfigured()) {
    redirect("/entrar?next=/admin");
  }

  if (!(await isAdminSessionValid())) {
    redirect("/entrar?next=/admin");
  }

  let state;

  try {
    state = await getAdminProductsState({
      productPage,
      selectedProductId: params?.produto ?? ""
    });
  } catch (error) {
    const loadError = getAdminLoadErrorState(error);

    return (
      <AdminSetup
        message={loadError.message}
        mode={loadError.kind === "schema" ? "database" : "service"}
      />
    );
  }

  if (!state.isConfigured) {
    return <AdminSetup message={message} />;
  }

  return (
    <AdminSectionShell
      activeTab="produtos"
      actions={
        <Link
          className={cx(globalStyles, "button button-primary")}
          href={buildAddProductHref({
            newProductCount,
            productPage,
            selectedProductId: params?.produto ?? ""
          })}
        >
          Adicionar produto
        </Link>
      }
      message={message}
    >
      <AdminProducts
        newProductCount={newProductCount}
        selectedProductId={params?.produto ?? ""}
        state={state}
      />
    </AdminSectionShell>
  );
}
