import test from "node:test";
import assert from "node:assert/strict";

import {
  blockedMotorcycleKeywords,
  catalogProducts,
  getConfiguratorProducts,
  getStorefrontMenu,
  rejectedCatalogProducts,
  validateCatalog
} from "../src/catalog/index.js";

test("storefront menu keeps the five approved labels", () => {
  const labels = getStorefrontMenu().map((category) => category.label);

  assert.deepEqual(labels, [
    "Suporte & Sliders",
    "Estética",
    "Escapamentos",
    "Adesivagem",
    "Manutenção"
  ]);
});

test("every published SKU has storefront categories and a technical family", () => {
  for (const product of catalogProducts) {
    assert.ok(product.storefrontCategoryIds.length >= 1, `${product.name} sem categoria`);
    assert.ok(product.productFamily, `${product.name} sem familia tecnica`);
  }
});

test("public catalog does not expose supplier sources", () => {
  for (const product of catalogProducts) {
    assert.equal(product.supplierSource, undefined, `${product.name} expos fornecedor`);
  }
});

test("published catalog excludes vestuario and unsupported motorcycles", () => {
  const blockedNames = ["r3", "sbm 250s", "zx10", "vestuario"];

  for (const product of catalogProducts) {
    const searchable = product.name.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

    for (const token of blockedNames) {
      assert.equal(
        searchable.includes(token),
        false,
        `${product.name} deveria ter sido removido por conter ${token}`
      );
    }

    assert.deepEqual(product.bikeModelScope, ["yamaha-r15"]);
  }
});

test("catalog allows approved style-reference exceptions for R15", () => {
  const frenteR6 = catalogProducts.find((product) => product.name === "Frente R6");
  const hayabusa = catalogProducts.find((product) =>
    product.name.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase() ===
    "hayabusa adesivos japones"
  );

  assert.ok(frenteR6);
  assert.ok(hayabusa);
});

test("cross-listed products stay as single SKUs", () => {
  const filtro = catalogProducts.find((product) => product.name === "Filtro de AR Esportivo");
  const protetor = catalogProducts.find((product) => product.name === "Protetor de Tanque Completo");

  assert.deepEqual(filtro.storefrontCategoryIds, ["escapamentos", "manutencao"]);
  assert.deepEqual(protetor.storefrontCategoryIds, ["adesivagem", "estetica"]);
});

test("configurator catalog contains only products with render slots", () => {
  for (const product of getConfiguratorProducts()) {
    assert.equal(product.is3DEligible, true);
    assert.ok(product.renderSlot, `${product.name} sem render slot`);
  }
});

test("rejection reports keep only blocked items", () => {
  const rejectedNames = rejectedCatalogProducts.map((product) => product.name);
  const normalizedRejectedNames = rejectedNames.map((name) =>
    name.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase()
  );

  assert.equal(rejectedNames.includes("Frente R6"), false);
  assert.equal(normalizedRejectedNames.includes("hayabusa adesivos japones"), false);
  assert.ok(rejectedNames.includes("Retrovisor ZX10"));
  assert.ok(rejectedNames.includes("Kit Slider Yamaha R3"));
  assert.ok(rejectedNames.includes("Carenagem Frontal SBM 250s"));
  assert.ok(rejectedNames.includes("Camiseta Premium"));
});

test("catalog validation reports no implementation issues", () => {
  assert.deepEqual(validateCatalog(), []);
  assert.ok(blockedMotorcycleKeywords.length > 0);
});
