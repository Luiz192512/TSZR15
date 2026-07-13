import globalStyles from "@/app/storefront.module.css";
import { cx } from "@/src/lib/classnames";
import { CatalogBrowser } from "@/src/components/catalog/catalog-browser.js";
import { StoreHeader } from "@/src/components/catalog/catalog-shared.js";
import { getStorefrontMenu } from "@/src/catalog/index.js";
import {
  getStorefrontCatalogPage,
  getStorefrontColorOptions
} from "@/src/catalog/storefront-query.js";
import { getCachedPublicCatalogProductsForStorefront } from "@/src/catalog/supabase-catalog.js";

export const metadata = {
  title: "Catálogo R15 | TSZR15",
  description: "Todos os produtos para Yamaha R15 com busca, filtros e ordenação."
};
export const revalidate = 3600;

function readFilters(params = {}) {
  return {
    category: params.categoria ?? "all",
    colors: params.cor ?? [],
    page: params.pagina ?? 1,
    priceRange: params.preco ?? "todos",
    query: params.busca ?? "",
    sort: params.ordem ?? "relevancia"
  };
}

export default async function CatalogPage({ searchParams }) {
  const params = await searchParams;
  const filters = readFilters(params);
  const catalog = await getCachedPublicCatalogProductsForStorefront();
  const menu = getStorefrontMenu(catalog.products);
  const catalogPage = getStorefrontCatalogPage(catalog.products, filters);
  const colorOptions = getStorefrontColorOptions(catalog.products);

  return (
    <main className={cx(globalStyles, "page-shell")}>
      <StoreHeader currentUser={null} resolveAccount={false} showSearch={false} />
      <CatalogBrowser
        catalogPage={catalogPage}
        catalogTotal={catalog.products.length}
        categories={menu}
        colorOptions={colorOptions}
        filters={filters}
      />
    </main>
  );
}
