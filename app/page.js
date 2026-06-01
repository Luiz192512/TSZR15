import { CatalogHub } from "@/src/components/catalog/catalog-hub.js";
import { getStorefrontMenu } from "@/src/catalog/index.js";
import { getPublicCatalogProductsForStorefront } from "@/src/catalog/supabase-catalog.js";

export const revalidate = 3600;

export default async function HomePage() {
  const catalog = await getPublicCatalogProductsForStorefront();
  const menu = getStorefrontMenu(catalog.products);

  return (
    <main className="page-shell">
      <CatalogHub categories={menu} currentUser={null} products={catalog.products} />
    </main>
  );
}
