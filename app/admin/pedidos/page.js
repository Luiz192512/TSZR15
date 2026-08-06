import globalStyles from "@/app/storefront.module.css";
import { cx } from "@/src/lib/classnames";
import Link from "next/link";
import { redirect } from "next/navigation";

import {
  AdminSectionShell,
  AdminSetup,
  getMessage
} from "@/app/admin/_components/admin-ui.js";
import { AdminOrders } from "@/app/admin/_components/admin-orders-view.js";
import { isAdminSessionValid, isAdminTokenConfigured } from "@/src/admin/admin-auth.js";
import { getAdminLoadErrorState } from "@/src/admin/admin-load-error.js";
import { getAdminDashboardState } from "@/src/admin/order-admin.js";

export const revalidate = 600;

export default async function AdminOrdersPage({ searchParams }) {
  const params = await searchParams;
  const message = getMessage(params);

  if (!isAdminTokenConfigured()) {
    redirect("/entrar?next=/admin");
  }

  if (!(await isAdminSessionValid())) {
    redirect("/entrar?next=/admin");
  }

  let state;

  try {
    state = await getAdminDashboardState({ selectedOrderNumber: params?.pedido });
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
      activeTab="pedidos"
      actions={
        <Link
          className={cx(globalStyles, "button button-primary")}
          href="/admin/pedidos?novoPedido=1"
        >
          Adicionar pedido
        </Link>
      }
      message={message}
    >
      <AdminOrders showNewOrder={params?.novoPedido === "1"} state={state} />
    </AdminSectionShell>
  );
}
