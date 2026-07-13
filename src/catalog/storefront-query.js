import { getVariationSwatchColor } from "./variation-images.js";

export const DEFAULT_STOREFRONT_PAGE_SIZE = 12;
export const MAX_STOREFRONT_PAGE_SIZE = 48;

const featuredProductIds = [
  "escapamento-sc-project-completo",
  "kit-suporte-slider",
  "kit-manete-manopla-pesinho",
  "bolha-esportiva",
  "farol-led-drl-predator-eye",
  "protetor-de-radiador-aluminio"
];

function normalizeSearch(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase();
}

function toPositiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeColors(value) {
  const values = Array.isArray(value) ? value : String(value ?? "").split(",");

  return [...new Set(values.map((item) => String(item).trim().toLowerCase()).filter(Boolean))];
}

function matchesPriceRange(product, priceRange) {
  if (priceRange === "ate-150") {
    return product.priceCents <= 15000;
  }

  if (priceRange === "150-300") {
    return product.priceCents > 15000 && product.priceCents <= 30000;
  }

  if (priceRange === "300-mais") {
    return product.priceCents > 30000;
  }

  return true;
}

function matchesColors(product, colors) {
  if (colors.length === 0) {
    return true;
  }

  return (product.variations ?? []).some((variation) => {
    const color = getVariationSwatchColor(variation);
    return color ? colors.includes(color.toLowerCase()) : false;
  });
}

function sortProducts(products, sort) {
  if (sort === "menor-preco") {
    return [...products].sort((first, second) => first.priceCents - second.priceCents);
  }

  if (sort === "maior-preco") {
    return [...products].sort((first, second) => second.priceCents - first.priceCents);
  }

  if (sort === "nome") {
    return [...products].sort((first, second) => first.name.localeCompare(second.name, "pt-BR"));
  }

  return products;
}

export function getStorefrontColorOptions(products = []) {
  const colorsByHex = new Map();

  for (const product of products) {
    for (const variation of product.variations ?? []) {
      const hex = getVariationSwatchColor(variation);

      if (hex && !colorsByHex.has(hex.toLowerCase())) {
        colorsByHex.set(hex.toLowerCase(), { hex: hex.toLowerCase(), label: variation });
      }
    }
  }

  return [...colorsByHex.values()];
}

export function getStorefrontFeaturedProducts(products = [], limit = 8) {
  const productsById = new Map(products.map((product) => [product.id, product]));
  const selectedProducts = featuredProductIds
    .map((productId) => productsById.get(productId))
    .filter(Boolean);
  const selectedIds = new Set(selectedProducts.map((product) => product.id));
  const fallbackProducts = products.filter((product) => !selectedIds.has(product.id));

  return [...selectedProducts, ...fallbackProducts].slice(0, limit);
}

export function getStorefrontCatalogPage(products = [], options = {}) {
  const category = String(options.category ?? "all").trim() || "all";
  const query = normalizeSearch(options.query);
  const sort = String(options.sort ?? "relevancia");
  const priceRange = String(options.priceRange ?? options.price ?? "todos");
  const colors = normalizeColors(options.colors ?? options.color);
  const pageSize = Math.min(
    toPositiveInteger(options.pageSize, DEFAULT_STOREFRONT_PAGE_SIZE),
    MAX_STOREFRONT_PAGE_SIZE
  );

  const filteredProducts = products.filter((product) => {
    const searchable = normalizeSearch(
      `${product.name ?? ""} ${product.productFamily ?? ""} ${(product.variations ?? []).join(" ")}`
    );
    const matchesQuery = !query || searchable.includes(query);
    const matchesCategory =
      category === "all" || (product.storefrontCategoryIds ?? []).includes(category);

    return (
      matchesQuery &&
      matchesCategory &&
      matchesPriceRange(product, priceRange) &&
      matchesColors(product, colors)
    );
  });
  const sortedProducts = sortProducts(filteredProducts, sort);
  const total = sortedProducts.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const requestedPage = toPositiveInteger(options.page, 1);
  const page = Math.min(requestedPage, pageCount);
  const offset = (page - 1) * pageSize;

  return {
    page,
    pageCount,
    pageSize,
    products: sortedProducts.slice(offset, offset + pageSize),
    total
  };
}
