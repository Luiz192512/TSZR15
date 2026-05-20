import { blockedStorefrontCategoryIds } from "./categories.js";

export const blockedMotorcycleKeywords = [
  "r3",
  "sbm 250s",
  "sbm250s",
  "r6",
  "zx10",
  "hayabusa"
];

export const allowedStyleReferenceSlugs = {
  "frente-r6": ["r6"],
  "hayabusa-adesivos-japones": ["hayabusa"]
};

export function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

export function getImportDecision(product) {
  const categoryIds = product.storefrontCategoryIds ?? [];
  const bikeScopes = product.bikeModelScope ?? [];
  const allowedReferenceKeywords = allowedStyleReferenceSlugs[product.slug] ?? [];
  const searchableText = normalizeText(
    [
      product.name,
      ...categoryIds,
      ...bikeScopes
    ].join(" ")
  );

  if (categoryIds.some((categoryId) => blockedStorefrontCategoryIds.includes(categoryId))) {
    return {
      accepted: false,
      reason: "blocked-category",
      message: "Itens de vestuario ficam fora do catalogo R15."
    };
  }

  const matchedBlockedKeyword = blockedMotorcycleKeywords.find((keyword) =>
    searchableText.includes(keyword)
  );

  if (matchedBlockedKeyword && !allowedReferenceKeywords.includes(matchedBlockedKeyword)) {
    return {
      accepted: false,
      reason: "other-motorcycle-reference",
      message: "Itens relacionados a outras motos nao podem entrar no catalogo publicado."
    };
  }

  if (bikeScopes.some((scope) => normalizeText(scope) !== "yamaha-r15")) {
    return {
      accepted: false,
      reason: "unsupported-bike-scope",
      message: "Somente SKUs com escopo Yamaha R15 podem ser publicados."
    };
  }

  return {
    accepted: true,
    reason: "supported-r15",
    message: "SKU publicado para o catalogo Yamaha R15."
  };
}

export function shouldImportProduct(product) {
  return getImportDecision(product).accepted;
}
