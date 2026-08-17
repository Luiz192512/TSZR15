import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { collectAdminVariationInventory } from "../src/admin/catalog-variations.js";

function variationCardsFormData(cards) {
  const formData = new FormData();
  formData.set("variationCards", JSON.stringify(cards));
  return formData;
}

test("variation stock save uses the atomic RPC instead of a fragile query chain", async () => {
  const catalogAdminSource = await readFile(
    new URL("../src/admin/catalog-admin.js", import.meta.url),
    "utf8",
  );
  const saveSource = catalogAdminSource.slice(
    catalogAdminSource.indexOf("export async function upsertAdminCatalogProduct"),
    catalogAdminSource.indexOf("export async function upsertAdminCoupon"),
  );

  assert.match(saveSource, /saveAdminCatalogProductAggregate\([\s\S]*?variationStock/);
  assert.doesNotMatch(saveSource, /\.from\("catalog_variation_stock"\)/);
});

test("admin product edit query loads the saved variation image groups", async () => {
  const catalogAdminSource = await readFile(
    new URL("../src/admin/catalog-admin.js", import.meta.url),
    "utf8",
  );
  const adminProductColumns =
    catalogAdminSource.match(
      /const adminProductColumns = \[([\s\S]*?)\]\.join\(","\);/,
    )?.[1] ?? "";

  assert.match(adminProductColumns, /"variation_images"/);
});

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
    sizeOptions: [],
    stock: [
      { quantity: 3, size: "", variation: "Preto" },
      { quantity: 0, size: "", variation: "Fumê" },
      { quantity: null, size: "", variation: "Padrão" },
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

test("cards com tamanhos geram uma linha de estoque por tamanho e publicam a grade", () => {
  const inventory = collectAdminVariationInventory(
    variationCardsFormData([
      {
        imageTokens: ["/img/camiseta.webp"],
        quantity: "99",
        sizes: [
          { quantity: "2", size: " P " },
          { quantity: "0", size: "M" },
          { quantity: "", size: "G" },
        ],
        variation: "Padrao",
      },
    ]),
  );

  assert.deepEqual(inventory.stock, [
    { quantity: 2, size: "P", variation: "Padrão" },
    { quantity: 0, size: "M", variation: "Padrão" },
    { quantity: null, size: "G", variation: "Padrão" },
  ]);
  assert.deepEqual(inventory.sizeOptions, ["P", "M", "G"]);
  assert.deepEqual(inventory.variations, ["Padrão"]);
});

test("tamanhos e variacoes convivem com produtos sem grade no mesmo save", () => {
  const inventory = collectAdminVariationInventory(
    variationCardsFormData([
      { imageTokens: [], quantity: "4", variation: "Preto" },
      {
        imageTokens: [],
        quantity: "",
        sizes: [{ quantity: "1", size: "GG" }],
        variation: "Branco",
      },
    ]),
  );

  assert.deepEqual(inventory.stock, [
    { quantity: 4, size: "", variation: "Preto" },
    { quantity: 1, size: "GG", variation: "Branco" },
  ]);
  assert.deepEqual(inventory.sizeOptions, ["GG"]);
});

test("tamanhos rejeitam duplicata, rotulo vazio e estoque invalido", () => {
  assert.throws(
    () =>
      collectAdminVariationInventory(
        variationCardsFormData([
          {
            imageTokens: [],
            quantity: "",
            sizes: [
              { quantity: "1", size: "M" },
              { quantity: "2", size: "m" },
            ],
            variation: "Padrao",
          },
        ]),
      ),
    /tamanho M foi informado mais de uma vez/i,
  );

  assert.throws(
    () =>
      collectAdminVariationInventory(
        variationCardsFormData([
          {
            imageTokens: [],
            quantity: "",
            sizes: [{ quantity: "3", size: "  " }],
            variation: "Padrao",
          },
        ]),
      ),
    /informe o nome de cada tamanho/i,
  );

  assert.throws(
    () =>
      collectAdminVariationInventory(
        variationCardsFormData([
          {
            imageTokens: [],
            quantity: "",
            sizes: [{ quantity: "-1", size: "P" }],
            variation: "Padrao",
          },
        ]),
      ),
    /estoque inválido para a variação Padrão \(P\)/i,
  );
});

test("rotulos com o separador do marcador de estoque sao recusados", () => {
  assert.throws(
    () =>
      collectAdminVariationInventory(
        variationCardsFormData([
          { imageTokens: [], quantity: "1", variation: "Preto|Branco" },
        ]),
      ),
    /caractere "\|" não é permitido em nome de variação/i,
  );

  assert.throws(
    () =>
      collectAdminVariationInventory(
        variationCardsFormData([
          {
            imageTokens: [],
            quantity: "",
            sizes: [{ quantity: "1", size: "P|M" }],
            variation: "Padrao",
          },
        ]),
      ),
    /caractere "\|" não é permitido em nome de tamanho/i,
  );
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
