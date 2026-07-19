import globalStyles from "@/app/storefront.module.css";
import { TrackingLookup } from "@/src/components/tracking/tracking-lookup.js";
import { SiteHeader } from "@/src/components/site-header.js";
import { getCurrentCustomerSnapshot } from "@/src/customer/customer-data.js";
import { cx } from "@/src/lib/classnames";
import { createServerSupabaseClient } from "@/src/lib/supabase/server.js";

export const metadata = {
  title: "Rastreio | TSZR15",
  description: "Acompanhamento de pedido TSZR15 por numero do pedido e contato."
};

export default async function TrackingPage() {
  const supabase = await createServerSupabaseClient();
  const snapshot = await getCurrentCustomerSnapshot(supabase);

  return (
    <main className={cx(globalStyles, "page-shell auth-page tracking-page")}>
      <SiteHeader user={snapshot.user} />
      <TrackingLookup />
    </main>
  );
}
