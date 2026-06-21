import { describe, expect, it, vi } from "vitest";

const revalidatePath = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath }));

const { getCatalogRevalidationPaths, revalidateCatalogPaths } =
  await import("../src/catalog/revalidation.js");

describe("revalidação do catálogo", () => {
  it("inclui a vitrine, catálogo, API, padrão de produto e slugs alterados", () => {
    expect(getCatalogRevalidationPaths(["bico-de-pato", ""])).toEqual([
      "/",
      "/catalogo",
      "/api/catalog",
      "/produto/[slug]",
      "/produto/bico-de-pato"
    ]);
  });

  it("invalida todas as rotas necessárias após uma alteração", () => {
    revalidateCatalogPaths(["bico-de-pato"]);

    expect(revalidatePath).toHaveBeenCalledWith("/");
    expect(revalidatePath).toHaveBeenCalledWith("/catalogo");
    expect(revalidatePath).toHaveBeenCalledWith("/api/catalog");
    expect(revalidatePath).toHaveBeenCalledWith("/produto/[slug]", "page");
    expect(revalidatePath).toHaveBeenCalledWith("/produto/bico-de-pato");
  });
});
