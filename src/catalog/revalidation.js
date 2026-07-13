import { revalidatePath, revalidateTag } from "next/cache";

import { STOREFRONT_CATALOG_CACHE_TAG } from "./cache-constants.js";

export function getCatalogRevalidationPaths(slugs = []) {
  return [
    "/",
    "/catalogo",
    "/api/catalog",
    "/produto/[slug]",
    ...slugs.filter(Boolean).map((slug) => `/produto/${slug}`)
  ];
}

export function revalidateCatalogPaths(slugs = []) {
  revalidateTag(STOREFRONT_CATALOG_CACHE_TAG, "max");
  revalidatePath("/");
  revalidatePath("/catalogo");
  revalidatePath("/api/catalog");
  revalidatePath("/produto/[slug]", "page");

  for (const slug of slugs.filter(Boolean)) {
    revalidatePath(`/produto/${slug}`);
  }
}
