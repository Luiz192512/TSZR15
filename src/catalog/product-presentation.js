import { getProductImageVariants } from "./image-variants.js";
import { getProductVariationImageIndex } from "./variation-images.js";

const featuredProductIds = [
  "escapamento-sc-project-completo",
  "kit-suporte-slider",
  "kit-manete-manopla-pesinho",
  "bolha-esportiva",
  "farol-led-drl-predator-eye",
  "protetor-de-radiador-aluminio"
];

const familyLabels = {
  aero_front: "Aerodinâmica",
  adesivo_detalhe: "Adesivo detalhe",
  adesivo_full: "Adesivo completo",
  cockpit: "Cockpit",
  controles: "Controles",
  escapamento: "Escapamento",
  iluminacao: "Iluminação",
  manutencao: "Manutenção",
  protecao: "Proteção",
  retrovisor: "Retrovisor",
  slider: "Slider",
  tanque: "Tanque"
};

const familySummaries = {
  aero_front: "Peça de visual e aerodinâmica para montar a frente ou acabamento da R15.",
  adesivo_detalhe: "Adesivo de detalhe para personalizar a R15 sem trocar a carenagem.",
  adesivo_full: "Kit visual completo para mudar a identidade da moto com acabamento combinado.",
  cockpit: "Item de cockpit para melhorar acabamento, uso diário ou proteção da área do piloto.",
  controles: "Comando ou acabamento de pilotagem para deixar a R15 mais ajustada ao uso.",
  escapamento: "Opção de escape ou admissão para montar o conjunto conforme disponibilidade.",
  iluminacao: "Iluminação e sinalização para atualizar o visual e a segurança da moto.",
  manutencao: "Item de reposição, limpeza ou cuidado para manter a R15 em dia.",
  protecao: "Proteção para reduzir dano em uso urbano, queda leve ou desgaste de peça.",
  retrovisor: "Retrovisor ou acabamento lateral para visual esportivo e uso no dia a dia.",
  slider: "Slider e suporte para proteger pontos expostos da Yamaha R15.",
  tanque: "Proteção ou acabamento para tanque com opções de cor e textura."
};

export function getProductCode(product) {
  return product.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export function getProductFamilyLabel(productFamily) {
  return familyLabels[productFamily] ?? String(productFamily ?? "").replaceAll("_", " ");
}

export function getProductSummary(product) {
  return product.notes || familySummaries[product.productFamily] || "Produto curado para Yamaha R15.";
}

export function getProductHref(product) {
  return `/produto/${product.slug}`;
}

export function getProductImages(product) {
  return Array.isArray(product.imageUrls)
    ? product.imageUrls.filter((imageUrl) => typeof imageUrl === "string" && imageUrl.trim())
    : [];
}

export function getProductVisualImage(product, size = "card") {
  const [coverImage] = getProductImages(product);
  const variants = getProductImageVariants(coverImage);

  return size === "card" ? variants.card : variants.detail;
}

export function getProductVariationImage(product, variation, size = "card") {
  const images = getProductImages(product);
  let cover = images[0];

  if (variation && images.length > 1) {
    const index = getProductVariationImageIndex(product, variation);

    if (index >= 0) {
      cover = images[index];
    }
  }

  const variants = getProductImageVariants(cover);

  return size === "card" ? variants.card : variants.detail;
}

export function getFeaturedProducts(products) {
  const productsById = new Map(products.map((product) => [product.id, product]));
  const selectedProducts = featuredProductIds
    .map((productId) => productsById.get(productId))
    .filter(Boolean);
  const selectedIds = new Set(selectedProducts.map((product) => product.id));
  const fallbackProducts = products.filter((product) => !selectedIds.has(product.id));

  return [...selectedProducts, ...fallbackProducts].slice(0, 8);
}
