import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { toAdminErrorMessage } from "../src/admin/admin-error-message.js";

test("mensagem tecnica do banco nao chega ao painel", () => {
  const tecnicas = [
    'duplicate key value violates unique constraint "catalog_products_pkey"',
    'null value in column "price_cents" of relation "catalog_products" violates not-null constraint',
    'column catalog_variation_stock_1.size does not exist',
    "permission denied for table orders",
    'Could not find the \'variation_images\' column of \'catalog_products\' in the schema cache',
    "42501: new row violates row-level security policy",
  ];

  for (const mensagem of tecnicas) {
    const resultado = toAdminErrorMessage(new Error(mensagem));

    assert.equal(
      resultado,
      "Nao foi possivel concluir a operacao. Tente novamente.",
      `deveria mascarar: ${mensagem}`,
    );
  }
});

test("mensagem escrita pela aplicacao continua visivel para o operador", () => {
  const nossas = [
    "Informe o nome do produto.",
    "A variação Fumê foi informada mais de uma vez.",
    "Selecione pelo menos uma categoria.",
    "Ja existe um produto com este slug/ID.",
    "Sessao administrativa expirada.",
  ];

  for (const mensagem of nossas) {
    assert.equal(toAdminErrorMessage(new Error(mensagem)), mensagem);
  }
});

test("valor nao textual e mensagem gigante viram texto seguro", () => {
  assert.equal(
    toAdminErrorMessage("string solta"),
    "Nao foi possivel concluir a operacao. Tente novamente.",
  );
  assert.equal(
    toAdminErrorMessage(null),
    "Nao foi possivel concluir a operacao. Tente novamente.",
  );
  assert.ok(toAdminErrorMessage(new Error("a".repeat(500))).length <= 200);
});

test("as actions do admin nao jogam o erro cru na URL", async () => {
  const source = await readFile(new URL("../app/admin/actions.js", import.meta.url), "utf8");

  assert.equal(
    /redirectWithError\([^)]*error\.message/.test(source),
    false,
    "redirectWithError deveria receber a mensagem sanitizada",
  );
  assert.match(source, /toAdminErrorMessage/);
});
