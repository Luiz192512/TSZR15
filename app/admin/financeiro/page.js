import { redirect } from "next/navigation";

import { AdminSectionShell, AdminSetup, getMessage } from "@/app/admin/_components/admin-ui.js";
import { AdminFinance } from "@/app/admin/_components/admin-finance-view.js";
import { isAdminSessionValid, isAdminTokenConfigured } from "@/src/admin/admin-auth.js";
import { getAdminLoadErrorState } from "@/src/admin/admin-load-error.js";
import { getAdminFinanceState } from "@/src/admin/finance-admin.js";

// Dinheiro a repassar nao pode vir de cache: o valor muda a cada webhook e a
// cada custo que o operador registra.
export const dynamic = "force-dynamic";

export default async function AdminFinancePage({ searchParams }) {
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
    state = await getAdminFinanceState();
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
    <AdminSectionShell activeTab="financeiro" message={message}>
      <AdminFinance ledgers={state.ledgers} summary={state.summary} />
    </AdminSectionShell>
  );
}
