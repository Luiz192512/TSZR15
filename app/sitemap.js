import { getPublicCatalogProductsForStorefront } from "@/src/catalog/supabase-catalog.js";

const siteUrl = "https://www.tszr15-store.com.br";

export default async function sitemap() {
  const catalog = await getPublicCatalogProductsForStorefront();
  const lastModified = new Date();

  return [
    { changeFrequency: "daily", lastModified, priority: 1, url: siteUrl },
    { changeFrequency: "daily", lastModified, priority: 0.9, url: `${siteUrl}/catalogo` },
    ...catalog.products.map((product) => ({
      changeFrequency: "weekly",
      lastModified,
      priority: 0.8,
      url: `${siteUrl}/produto/${product.slug}`
    }))
  ];
}
