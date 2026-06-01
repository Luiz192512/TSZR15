import { CatalogHub } from "@/src/components/catalog/catalog-hub.js";
import { getStorefrontMenu } from "@/src/catalog/index.js";
import { getPublicCatalogProductsForStorefront } from "@/src/catalog/supabase-catalog.js";

export const metadata = {
  title: "Produtos R15 | TSZR15",
  description: "Produtos R15 com detalhes, variacoes e carrinho separado."
};
export const revalidate = 3600;

export default async function CatalogPage() {
  const catalog = await getPublicCatalogProductsForStorefront();
  const menu = getStorefrontMenu(catalog.products);

  return (
    <main className="page-shell">
      <CatalogHub categories={menu} currentUser={null} products={catalog.products} />
    </main>
  );
}
