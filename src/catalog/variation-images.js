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

// Cores de amostra (swatch) para nomes comuns de variacao pt-BR.
// Retorna null quando o nome nao mapeia para uma cor visual.
const variationSwatchColors = new Map([
  ["preto", "#1c1f26"],
  ["preta", "#1c1f26"],
  ["prata", "#c9ccd4"],
  ["aluminio", "#c9ccd4"],
  ["fume", "#4a4f5a"],
  ["transparente", "#aeb6c6"],
  ["azul", "#3e6bff"],
  ["vermelho", "#ff3742"],
  ["vermelha", "#ff3742"],
  ["carbono", "#2b2f38"],
  ["carbon-look", "#2b2f38"],
  ["dourado", "#d0a83e"],
  ["amarelo", "#f0b43c"],
  ["verde", "#1fbf75"],
  ["branco", "#f3f4f6"],
  ["laranja", "#ff7a30"],
  ["titanio", "#8f96a3"]
]);

export function getVariationSwatchColor(variation) {
  const token = normalizeVariationImageToken(variation);

  if (variationSwatchColors.has(token)) {
    return variationSwatchColors.get(token);
  }

  for (const [name, color] of variationSwatchColors) {
    if (token.includes(name)) {
      return color;
    }
  }

  return null;
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
