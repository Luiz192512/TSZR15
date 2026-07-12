import assert from "node:assert/strict";
import test from "node:test";

import {
  collectAdminVariationInventory,
  formatAdminVariationInventory,
} from "../src/admin/catalog-variations.js";

function variationFormData(value) {
  const formData = new FormData();
  formData.set("variationInventory", value);
  return formData;
}

test("single variation field creates variations and stock in the same order", () => {
  const inventory = collectAdminVariationInventory(
    variationFormData("  Preto  =3\nFume=0\nPadrao="),
  );

  assert.deepEqual(inventory, {
    stock: [
      { quantity: 3, variation: "Preto" },
      { quantity: 0, variation: "Fumê" },
      { quantity: null, variation: "Padrão" },
    ],
    variations: ["Preto", "Fumê", "Padrão"],
  });
});

test("single variation field rejects duplicate normalized names", () => {
  assert.throws(
    () => collectAdminVariationInventory(variationFormData("Fumê=2\nfume=2")),
    /variação Fumê foi informada mais de uma vez/i,
  );
});

test("unified variation inventory rejects invalid quantities and empty products", () => {
  assert.throws(
    () => collectAdminVariationInventory(variationFormData("Preto=2,5")),
    /estoque inválido para a variação Preto/i,
  );
  assert.throws(
    () => collectAdminVariationInventory(variationFormData("")),
    /informe pelo menos uma variação/i,
  );
});

test("admin variation formatter joins every name and quantity in one field", () => {
  assert.equal(
    formatAdminVariationInventory(
      ["Preto", "Fume", "Padrao"],
      [
        { quantity: 4, variation: "Preto" },
        { quantity: 0, variation: "Fume" },
      ],
    ),
    "Preto=4\nFumê=0\nPadrão=",
  );
  assert.equal(formatAdminVariationInventory([], []), "Padrão=");
});
