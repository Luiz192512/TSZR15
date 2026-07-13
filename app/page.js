import globalStyles from "@/app/storefront.module.css";
import { cx } from "@/src/lib/classnames";
import { CatalogHub } from "@/src/components/catalog/catalog-hub.js";
import { getStorefrontMenu } from "@/src/catalog/index.js";
import {
  getStorefrontCatalogPage,
  getStorefrontFeaturedProducts
} from "@/src/catalog/storefront-query.js";
import { getCachedPublicCatalogProductsForStorefront } from "@/src/catalog/supabase-catalog.js";

// As ações administrativas invalidam estas rotas; o TTL de uma hora cobre alterações externas.
export const revalidate = 3600;

export default async function HomePage({ searchParams }) {
  const params = await searchParams;
  const filters = {
    category: params?.categoria ?? "all",
    page: params?.pagina ?? 1,
    query: params?.busca ?? ""
  };
  const catalog = await getCachedPublicCatalogProductsForStorefront();
  const menu = getStorefrontMenu(catalog.products);
  const catalogPage = getStorefrontCatalogPage(catalog.products, filters);
  const featuredProducts = getStorefrontFeaturedProducts(catalog.products);

  return (
    <main className={cx(globalStyles, "page-shell")}>
      <CatalogHub
        catalogPage={catalogPage}
        catalogTotal={catalog.products.length}
        categories={menu}
        currentUser={null}
        featuredProducts={featuredProducts}
        filters={filters}
      />
    </main>
  );
}
