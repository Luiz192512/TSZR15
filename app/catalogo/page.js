import globalStyles from "@/app/storefront.module.css";
import { cx } from "@/src/lib/classnames";
import { CatalogBrowser } from "@/src/components/catalog/catalog-browser.js";
import { StoreHeader } from "@/src/components/catalog/catalog-shared.js";
import { getStorefrontMenu } from "@/src/catalog/index.js";
import { getPublicCatalogProductsForStorefront } from "@/src/catalog/supabase-catalog.js";

export const metadata = {
  title: "Catálogo R15 | TSZR15",
  description: "Todos os produtos para Yamaha R15 com busca, filtros e ordenação."
};
export const revalidate = 60;

export default async function CatalogPage() {
  const catalog = await getPublicCatalogProductsForStorefront();
  const menu = getStorefrontMenu(catalog.products);

  return (
    <main className={cx(globalStyles, "page-shell")}>
      <StoreHeader currentUser={null} resolveAccount={false} showSearch={false} />
      <CatalogBrowser categories={menu} products={catalog.products} />
    </main>
  );
}
