import { CatalogHub } from "@/src/components/catalog/catalog-experience.js";
import { getStorefrontMenu } from "@/src/catalog/index.js";
import { getPublicCatalogProductsForStorefront } from "@/src/catalog/supabase-catalog.js";
import { getCurrentCustomerSnapshot } from "@/src/customer/customer-data.js";
import { createServerSupabaseClient } from "@/src/lib/supabase/server.js";

export const metadata = {
  title: "Produtos R15 | TSZR15",
  description: "Produtos R15 com detalhes, variacoes e carrinho separado."
};

export default async function CatalogPage() {
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
