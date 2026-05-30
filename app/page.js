import { CatalogHub } from "@/src/components/catalog/catalog-experience.js";
import { getStorefrontMenu } from "@/src/catalog/index.js";
import { getPublicCatalogProductsForStorefront } from "@/src/catalog/supabase-catalog.js";
import { getCurrentCustomerSnapshot } from "@/src/customer/customer-data.js";
import { createServerSupabaseClient } from "@/src/lib/supabase/server.js";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getParamValue(params, key) {
  const value = params?.[key];
  return Array.isArray(value) ? value[0] : value;
}

function redirectRootRecoveryCode(params) {
  const code = getParamValue(params, "code");

  if (!code) {
    return;
  }

  const callbackUrl = new URL("/auth/callback", "https://www.tszr15-store.com.br");
  callbackUrl.searchParams.set("code", code);
  callbackUrl.searchParams.set("next", "/trocar-senha");

  redirect(`${callbackUrl.pathname}${callbackUrl.search}`);
}

export default async function HomePage({ searchParams }) {
  const params = await searchParams;
  redirectRootRecoveryCode(params);

  const catalog = await getPublicCatalogProductsForStorefront();
  const menu = getStorefrontMenu(catalog.products);
  const supabase = await createServerSupabaseClient();
  const customerSnapshot = await getCurrentCustomerSnapshot(supabase);

  return (
    <main className="page-shell">
      <CatalogHub
        categories={menu}
        currentUser={customerSnapshot.user}
        products={catalog.products}
      />
    </main>
  );
}
