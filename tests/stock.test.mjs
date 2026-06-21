import assert from "node:assert/strict";
import test from "node:test";

import { attachVariationStock, getVariationStockStatus } from "../src/catalog/stock.js";

test("estoque nulo permite compra assistida, zero bloqueia e saldo positivo informa quantidade", () => {
  const product = {
    variationStock: [
      { quantity: null, variation: "Preto" },
      { quantity: 0, variation: "Vermelho" },
      { quantity: 3, variation: "Azul" }
    ]
  };

  assert.deepEqual(getVariationStockStatus(product, "Preto"), {
    canAddToCart: true,
    label: "Consultar disponibilidade",
    quantity: null,
    status: "consult"
  });
  assert.equal(getVariationStockStatus(product, "Vermelho").canAddToCart, false);
  assert.equal(getVariationStockStatus(product, "Azul").label, "3 em estoque");
});

test("vincula o estoque recebido aos respectivos produtos", () => {
  const [first, second] = attachVariationStock(
    [{ id: "slider" }, { id: "retrovisor" }],
    [{ product_id: "slider", quantity: 2, variation: "Preto" }]
  );

  assert.deepEqual(first.variationStock, [{ quantity: 2, variation: "Preto" }]);
  assert.deepEqual(second.variationStock, []);
});
