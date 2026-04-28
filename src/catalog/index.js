import {
  renderSlots,
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
  renderSlots,
  storefrontCategories,
  technicalFamilies
};

export function getStorefrontMenu() {
  return storefrontCategories.map((category) => ({
    ...category,
    productCount: catalogProducts.filter((product) =>
      product.storefrontCategoryIds.includes(category.id)
    ).length
  }));
}

export function getConfiguratorProducts() {
  return catalogProducts.filter((product) => product.is3DEligible && product.renderSlot);
}

export function groupConfiguratorProductsBySlot() {
  return renderSlots
    .map((slot) => ({
      slot,
      products: catalogProducts.filter((product) => product.renderSlot === slot)
    }))
    .filter((group) => group.products.length > 0);
}

export function getCatalogStats() {
  return [
    { label: "Produtos publicados", value: catalogProducts.length },
    { label: "Itens com slot 3D", value: getConfiguratorProducts().length },
    { label: "Categorias no menu", value: storefrontCategories.length },
    { label: "Slots ativos", value: groupConfiguratorProductsBySlot().length }
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

export function validateCatalog(products = catalogProducts) {
  const issues = [];
  const slugs = new Set();

  if (storefrontCategories.length !== 5) {
    issues.push("O menu deve conter exatamente cinco categorias visíveis.");
  }

  for (const product of products) {
    if (!product.storefrontCategoryIds?.length) {
      issues.push(`${product.name}: SKU sem categoria de vitrine.`);
    }

    if (!product.productFamily) {
      issues.push(`${product.name}: SKU sem família técnica.`);
    }

    if (slugs.has(product.slug)) {
      issues.push(`${product.name}: slug duplicado no catálogo.`);
    }

    slugs.add(product.slug);

    const decision = getImportDecision(product);
    if (!decision.accepted) {
      issues.push(`${product.name}: produto bloqueado vazou para o catálogo publicado.`);
    }

    for (const categoryId of product.storefrontCategoryIds) {
      if (!storefrontCategoryMap.has(categoryId)) {
        issues.push(`${product.name}: categoria inválida "${categoryId}".`);
      }
    }

    if (product.is3DEligible && !product.renderSlot) {
      issues.push(`${product.name}: produto 3D precisa declarar renderSlot.`);
    }
  }

  return issues;
}
