import { getStorefrontMenu } from "@/src/catalog/index.js";
import { getPublicCatalogProductsForStorefront } from "@/src/catalog/supabase-catalog.js";

export async function GET() {
  const catalog = await getPublicCatalogProductsForStorefront();

  return Response.json({
    categories: getStorefrontMenu(catalog.products),
    products: catalog.products,
    source: catalog.source
  });
}
