import assert from "node:assert/strict";
import test from "node:test";

import { collectAdminVariationInventory } from "../src/admin/catalog-variations.js";

function variationCardsFormData(cards) {
  const formData = new FormData();
  formData.set("variationCards", JSON.stringify(cards));
  return formData;
}

test("variation cards keep names, stock and image tokens in the same order", () => {
  const inventory = collectAdminVariationInventory(
    variationCardsFormData([
      {
        imageTokens: ["/img/preto.webp", "new:0"],
        quantity: "3",
        variation: "  Preto  ",
      },
      {
        imageTokens: ["/img/fume.webp"],
        quantity: "0",
        variation: "Fume",
      },
      { imageTokens: [], quantity: "", variation: "Padrao" },
    ]),
  );

  assert.deepEqual(inventory, {
    stock: [
      { quantity: 3, variation: "Preto" },
      { quantity: 0, variation: "Fumê" },
      { quantity: null, variation: "Padrão" },
    ],
    variationImageTokens: [
      {
        imageTokens: ["/img/preto.webp", "new:0"],
        variation: "Preto",
      },
      { imageTokens: ["/img/fume.webp"], variation: "Fumê" },
      { imageTokens: [], variation: "Padrão" },
    ],
    variations: ["Preto", "Fumê", "Padrão"],
  });
});

test("variation cards reject duplicate normalized names", () => {
  assert.throws(
    () =>
      collectAdminVariationInventory(
        variationCardsFormData([
          { imageTokens: [], quantity: "2", variation: "Fumê" },
          { imageTokens: [], quantity: "2", variation: "fume" },
        ]),
      ),
    /variação Fumê foi informada mais de uma vez/i,
  );
});

test("variation cards reject invalid quantities and empty products", () => {
  assert.throws(
    () =>
      collectAdminVariationInventory(
        variationCardsFormData([
          { imageTokens: [], quantity: "2,5", variation: "Preto" },
        ]),
      ),
    /estoque inválido para a variação Preto/i,
  );
  assert.throws(
    () => collectAdminVariationInventory(variationCardsFormData([])),
    /informe pelo menos uma variação/i,
  );
});
