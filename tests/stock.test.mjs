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

test("par de variacao e tamanho sem linha de estoque nao pode ser comprado", () => {
  // Grade publicada e a uniao dos tamanhos das variacoes: Preto tem P e M,
  // Branco tem G. Os pares que ninguem cadastrou nao existem para venda.
  const product = {
    sizeOptions: ["P", "M", "G"],
    variations: ["Preto", "Branco"],
    variationStock: [
      { quantity: 2, size: "P", variation: "Preto" },
      { quantity: 1, size: "M", variation: "Preto" },
      { quantity: 5, size: "G", variation: "Branco" }
    ]
  };

  assert.equal(getVariationStockStatus(product, "Preto", "P").canAddToCart, true);
  assert.equal(getVariationStockStatus(product, "Branco", "G").canAddToCart, true);

  const parInexistente = getVariationStockStatus(product, "Preto", "G");

  assert.equal(parInexistente.canAddToCart, false);
  assert.equal(parInexistente.status, "out");
  assert.equal(getVariationStockStatus(product, "Branco", "P").canAddToCart, false);
});

test("produto sem grade mantem o estoque nulo como compra assistida", () => {
  const product = {
    variations: ["Padrão"],
    variationStock: [{ quantity: null, size: "", variation: "Padrão" }]
  };

  assert.equal(getVariationStockStatus(product, "Padrão").canAddToCart, true);
  assert.equal(getVariationStockStatus(product, "Padrão").status, "consult");
  // Variacao que nem existe em produto sem grade segue como sob consulta:
  // e assim que o catalogo de acessorios se comporta hoje.
  assert.equal(getVariationStockStatus(product, "Inexistente").canAddToCart, true);
});

test("vincula o estoque recebido aos respectivos produtos", () => {
  const [first, second] = attachVariationStock(
    [{ id: "slider" }, { id: "retrovisor" }],
    [{ product_id: "slider", quantity: 2, variation: "Preto" }]
  );

  assert.deepEqual(first.variationStock, [{ quantity: 2, size: "", variation: "Preto" }]);
  assert.deepEqual(second.variationStock, []);
});
