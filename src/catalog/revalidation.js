import { revalidatePath } from "next/cache";

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
  revalidatePath("/");
  revalidatePath("/catalogo");
  revalidatePath("/api/catalog");
  revalidatePath("/produto/[slug]", "page");

  for (const slug of slugs.filter(Boolean)) {
    revalidatePath(`/produto/${slug}`);
  }
}
