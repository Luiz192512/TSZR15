import { redirect } from "next/navigation";

import { AdminSectionShell, AdminSetup, getMessage } from "@/app/admin/_components/admin-ui.js";
import { AdminAnalytics } from "@/app/admin/_components/admin-analytics-view.js";
import { isAdminSessionValid, isAdminTokenConfigured } from "@/src/admin/admin-auth.js";
import { getAdminLoadErrorState } from "@/src/admin/admin-load-error.js";
import { getAdminAnalyticsState } from "@/src/admin/order-admin.js";

// Sem export const revalidate: o guard chama cookies(), entao a rota e sempre
// dinamica e o Full Route Cache nunca entra. Ver PR de follow-ups do admin.

export default async function AdminAnalyticsPage({ searchParams }) {
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
    state = await getAdminAnalyticsState();
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
    <AdminSectionShell activeTab="analise" message={message}>
      <AdminAnalytics analytics={state.analytics} pendingReviews={state.pendingReviews ?? []} />
    </AdminSectionShell>
  );
}
