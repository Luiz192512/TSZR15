import {
  storefrontCategories,
  storefrontCategoryMap,
  technicalFamilies
} from "./categories.js";
import { catalogProducts, rawCatalogProducts, rejectedCatalogProducts } from "./products.js";
import { blockedMotorcycleKeywords, getImportDecision } from "./importRules.js";

export {
  blockedMotorcycleKeywords,
  catalogProducts,
  rawCatalogProducts,
  rejectedCatalogProducts,
  storefrontCategories,
  technicalFamilies
};

export function getStorefrontMenu(products = catalogProducts) {
  return storefrontCategories.map((category) => ({
    ...category,
    productCount: products.filter((product) =>
      product.storefrontCategoryIds.includes(category.id)
    ).length
  }));
}

export function toPublicCatalogProduct(product) {
  const {
    costCents,
    internalPurchaseCandidates,
    internalPurchaseSource,
    marginPercent,
    profitCents,
    supplierSource,
    ...publicProduct
  } = product;

  return publicProduct;
}

export function getPublicCatalogProducts(products = catalogProducts) {
  return products.map(toPublicCatalogProduct);
}

export function getCatalogStats() {
  const categoryCount = storefrontCategories.length;
  const averageTicketCents = Math.round(
    catalogProducts.reduce((total, product) => total + product.priceCents, 0) /
      Math.max(catalogProducts.length, 1)
  );

  return [
    { label: "Produtos publicados", value: catalogProducts.length },
    { label: "Categorias no menu", value: categoryCount },
    { label: "Ticket medio catalogo", value: formatCurrency(averageTicketCents) },
    { label: "Canal de fechamento", value: "WhatsApp" }
  ];
}

export function groupProductsByCategory(products = catalogProducts) {
  return storefrontCategories.map((category) => ({
    ...category,
    products: products.filter((product) => product.storefrontCategoryIds.includes(category.id))
  }));
}

export function formatCategoryLabels(categoryIds) {
  return categoryIds.map((categoryId) => storefrontCategoryMap.get(categoryId)?.label ?? categoryId);
}

export function formatCurrency(cents) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format((cents ?? 0) / 100);
}

export function validateCatalog(products = catalogProducts) {
  const issues = [];
  const slugs = new Set();

  if (storefrontCategories.length !== 5) {
    issues.push("O menu deve conter exatamente cinco categorias visiveis.");
  }

  for (const product of products) {
    if (!product.storefrontCategoryIds?.length) {
      issues.push(`${product.name}: SKU sem categoria de vitrine.`);
    }

    if (!product.productFamily) {
      issues.push(`${product.name}: SKU sem familia tecnica.`);
    }

    if (!Number.isInteger(product.priceCents) || product.priceCents <= 0) {
      issues.push(`${product.name}: SKU sem preco valido para WhatsApp checkout.`);
    }

    if (!Array.isArray(product.variations) || product.variations.length === 0) {
      issues.push(`${product.name}: SKU sem variacao padrao.`);
    }

    if (product.checkoutChannel !== "whatsapp-business") {
      issues.push(`${product.name}: SKU precisa fechar pelo WhatsApp Business.`);
    }

    if (slugs.has(product.slug)) {
      issues.push(`${product.name}: slug duplicado no catalogo.`);
    }

    slugs.add(product.slug);

    const decision = getImportDecision(product);
    if (!decision.accepted) {
      issues.push(`${product.name}: produto bloqueado vazou para o catalogo publicado.`);
    }

    for (const categoryId of product.storefrontCategoryIds) {
      if (!storefrontCategoryMap.has(categoryId)) {
        issues.push(`${product.name}: categoria invalida "${categoryId}".`);
      }
    }
  }

  return issues;
}
