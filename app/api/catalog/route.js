import { catalogProducts, getStorefrontMenu } from "@/src/catalog/index.js";

export function GET() {
  return Response.json({
    categories: getStorefrontMenu(),
    products: catalogProducts
  });
}
