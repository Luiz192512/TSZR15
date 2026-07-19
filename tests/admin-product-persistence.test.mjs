import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

function createProductTable({ insertError = null, upsertError = null } = {}) {
  const calls = [];
  const table = {
    async insert(row) {
      calls.push({ method: "insert", row });
      return { error: insertError };
    },
    async upsert(row, options) {
      calls.push({ method: "upsert", options, row });
      return { error: upsertError };
    }
  };

  return {
    calls,
    supabase: {
      from(name) {
        assert.equal(name, "catalog_products");
        return table;
      }
    }
  };
}

test("new products insert while edits target the existing immutable id", async () => {
  const source = await readFile(
    new URL("../src/admin/catalog-admin.js", import.meta.url),
    "utf8"
  );

  assert.match(source, /const persistenceMode = previousId \? "update" : "create";/);
  assert.match(source, /saveAdminCatalogProductRow\(\{[\s\S]*?persistenceMode/);

  const { saveAdminCatalogProductRow } = await import(
    "../src/admin/catalog-product-persistence.js"
  );
  const createTable = createProductTable();

  await saveAdminCatalogProductRow({
    persistenceMode: "create",
    row: { id: "produto-novo", slug: "produto-novo" },
    supabase: createTable.supabase
  });

  assert.deepEqual(createTable.calls, [
    {
      method: "insert",
      row: { id: "produto-novo", slug: "produto-novo" }
    }
  ]);

  const updateTable = createProductTable();

  await saveAdminCatalogProductRow({
    persistenceMode: "update",
    row: { id: "produto-existente", slug: "slug-atualizado" },
    supabase: updateTable.supabase
  });

  assert.deepEqual(updateTable.calls, [
    {
      method: "upsert",
      options: { onConflict: "id" },
      row: { id: "produto-existente", slug: "slug-atualizado" }
    }
  ]);
});

test("duplicate product identity returns a friendly error without overwriting", async () => {
  const source = await readFile(
    new URL("../src/admin/catalog-admin.js", import.meta.url),
    "utf8"
  );

  assert.match(source, /const persistenceMode = previousId \? "update" : "create";/);

  const { saveAdminCatalogProductRow } = await import(
    "../src/admin/catalog-product-persistence.js"
  );
  const duplicateTable = createProductTable({
    insertError: {
      code: "23505",
      message: "duplicate key value violates unique constraint"
    }
  });

  await assert.rejects(
    () =>
      saveAdminCatalogProductRow({
        persistenceMode: "create",
        row: { id: "produto-existente", slug: "produto-existente" },
        supabase: duplicateTable.supabase
      }),
    /ja existe um produto com este slug\/ID/i
  );

  assert.deepEqual(
    duplicateTable.calls.map((call) => call.method),
    ["insert"]
  );
});
