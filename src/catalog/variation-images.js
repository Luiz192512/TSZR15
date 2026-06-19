export function normalizeVariationImageToken(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function getVariationSearchTokens(variation) {
  const normalizedVariation = normalizeVariationImageToken(variation);
  const tokens = new Set([normalizedVariation]);

  if (normalizedVariation.includes("carbon")) {
    tokens.add("carbono");
  }

  if (normalizedVariation === "preto") {
    tokens.add("preta");
  }

  if (normalizedVariation === "vermelho") {
    tokens.add("vermelha");
  }

  return [...tokens].filter(Boolean);
}

function getImageSearchValue(imageUrl) {
  try {
    return normalizeVariationImageToken(decodeURIComponent(String(imageUrl ?? "")));
  } catch {
    return normalizeVariationImageToken(imageUrl);
  }
}

export function getProductVariationImageIndex(product, variation) {
  const images = Array.isArray(product?.imageUrls) ? product.imageUrls : [];
  const variations = Array.isArray(product?.variations) ? product.variations : [];

  if (images.length === 0) {
    return 0;
  }

  const tokens = getVariationSearchTokens(variation);
  const matchedImageIndex = images.findIndex((imageUrl) => {
    const imageSearchValue = getImageSearchValue(imageUrl);

    return tokens.some((token) => imageSearchValue.includes(token));
  });

  if (matchedImageIndex >= 0) {
    return matchedImageIndex;
  }

  const normalizedVariation = normalizeVariationImageToken(variation);
  const variationIndex = variations.findIndex(
    (candidate) => normalizeVariationImageToken(candidate) === normalizedVariation
  );

  return variationIndex >= 0 && variationIndex < images.length ? variationIndex : 0;
}
