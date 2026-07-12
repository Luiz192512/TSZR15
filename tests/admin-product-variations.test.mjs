import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAdminVariationRows,
  collectAdminVariationInventory,
} from "../src/admin/catalog-variations.js";

function variationFormData(entries) {
  const formData = new FormData();

  for (const entry of entries) {
    formData.append("variationName", entry.name);
    formData.append("variationQuantity", entry.quantity ?? "");
  }

  return formData;
}

test("unified variation inventory creates variations and stock in the same order", () => {
  const inventory = collectAdminVariationInventory(
    variationFormData([
      { name: "  Preto  ", quantity: "3" },
      { name: "Fume", quantity: "0" },
      { name: "Padrao", quantity: "" },
    ]),
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

test("unified variation inventory rejects duplicate normalized names", () => {
  assert.throws(
    () =>
      collectAdminVariationInventory(
        variationFormData([
          { name: "Fumê", quantity: "2" },
          { name: "fume", quantity: "2" },
        ]),
      ),
    /variação Fumê foi informada mais de uma vez/i,
  );
});

test("unified variation inventory rejects invalid quantities and empty products", () => {
  assert.throws(
    () =>
      collectAdminVariationInventory(
        variationFormData([{ name: "Preto", quantity: "2,5" }]),
      ),
    /estoque inválido para a variação Preto/i,
  );
  assert.throws(
    () => collectAdminVariationInventory(variationFormData([])),
    /informe pelo menos uma variação/i,
  );
});

test("admin variation rows join each product variation with its stock", () => {
  assert.deepEqual(
    buildAdminVariationRows(
      ["Preto", "Fume", "Padrao"],
      [
        { quantity: 4, variation: "Preto" },
        { quantity: 0, variation: "Fume" },
      ],
    ),
    [
      { name: "Preto", quantity: "4" },
      { name: "Fumê", quantity: "0" },
      { name: "Padrão", quantity: "" },
    ],
  );
  assert.deepEqual(buildAdminVariationRows([], []), [
    { name: "Padrão", quantity: "" },
  ]);
});
