import globalStyles from "@/app/storefront.module.css";
import { cx } from "@/src/lib/classnames";
import { CatalogHub } from "@/src/components/catalog/catalog-hub.js";
import { getStorefrontMenu } from "@/src/catalog/index.js";
import { getPublicCatalogProductsForStorefront } from "@/src/catalog/supabase-catalog.js";

// As ações administrativas já invalidam estas rotas; o TTL curto cobre alterações externas.
export const revalidate = 60;

export default async function HomePage() {
  const catalog = await getPublicCatalogProductsForStorefront();
  const menu = getStorefrontMenu(catalog.products);

  return (
    <main className={cx(globalStyles, "page-shell")}>
      <CatalogHub categories={menu} currentUser={null} products={catalog.products} />
    </main>
  );
}
