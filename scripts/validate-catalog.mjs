import { catalogProducts, rejectedCatalogProducts, validateCatalog } from "../src/catalog/index.js";

const issues = validateCatalog();

if (issues.length > 0) {
  console.error("Catalog validation failed:");
  for (const issue of issues) {
    console.error(`- ${issue}`);
  }
  process.exit(1);
}

console.log(`Catalog validation passed for ${catalogProducts.length} published products.`);
console.log(`Rejected products: ${rejectedCatalogProducts.length}.`);
