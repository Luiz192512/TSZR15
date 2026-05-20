import {
  catalogProducts,
  getPublicCatalogProducts,
  getStorefrontMenu
} from "@/src/catalog/index.js";

export function GET() {
  return Response.json({
    categories: getStorefrontMenu(),
    products: getPublicCatalogProducts(catalogProducts)
  });
}
