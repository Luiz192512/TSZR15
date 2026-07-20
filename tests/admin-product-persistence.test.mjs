import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

function createSupabase({ data = { id: "produto-1", slug: "produto-1" }, error = null } = {}) {
  const calls = [];

  return {
    calls,
    supabase: {
      async rpc(name, args) {
        calls.push({ args, name });
        return { data, error };
      }
    }
  };
}

test("product save sends product, stock, cost and categories in one atomic RPC", async () => {
  const source = await readFile(
    new URL("../src/admin/catalog-admin.js", import.meta.url),
    "utf8"
  );
  const saveSource = source.slice(
    source.indexOf("export async function upsertAdminCatalogProduct"),
    source.indexOf("export async function upsertAdminCoupon")
  );

  assert.match(source, /const persistenceMode = previousId \? "update" : "create";/);
  assert.match(
    saveSource,
    /runWithAdminProductImageCleanup\(\{[\s\S]*?saveAdminCatalogProductAggregate\(\{[\s\S]*?costCents[\s\S]*?variationStock/
  );
  assert.doesNotMatch(
    saveSource,
    /\.from\("catalog_(?:products|variation_stock|product_costs|product_categories)"\)/
  );

  const { saveAdminCatalogProductAggregate } = await import(
    "../src/admin/catalog-product-persistence.js"
  );
  const client = createSupabase();
  const row = {
    id: "produto-1",
    slug: "produto-1",
    storefront_category_ids: ["carenagem"]
  };
  const variationStock = [{ quantity: 2, variation: "Preto" }];

  const result = await saveAdminCatalogProductAggregate({
    costCents: 10990,
    persistenceMode: "update",
    row,
    supabase: client.supabase,
    variationStock
  });

  assert.deepEqual(client.calls, [
    {
      name: "save_admin_catalog_product",
      args: {
        p_cost_cents: 10990,
        p_persistence_mode: "update",
        p_product: row,
        p_variation_stock: variationStock
      }
    }
  ]);
  assert.deepEqual(result, { id: "produto-1", slug: "produto-1" });
});

test("duplicate product identity returns a friendly error without retrying as update", async () => {
  const { saveAdminCatalogProductAggregate } = await import(
    "../src/admin/catalog-product-persistence.js"
  );
  const client = createSupabase({
    error: {
      code: "23505",
      message: "duplicate key value violates unique constraint"
    }
  });

  await assert.rejects(
    () =>
      saveAdminCatalogProductAggregate({
        costCents: null,
        persistenceMode: "create",
        row: { id: "produto-existente", slug: "produto-existente" },
        supabase: client.supabase,
        variationStock: []
      }),
    /ja existe um produto com este slug\/ID/i
  );

  assert.equal(client.calls.length, 1);
  assert.equal(client.calls[0].args.p_persistence_mode, "create");
});

test("invalid product persistence mode is rejected before calling the RPC", async () => {
  const { saveAdminCatalogProductAggregate } = await import(
    "../src/admin/catalog-product-persistence.js"
  );
  const client = createSupabase();

  await assert.rejects(
    () =>
      saveAdminCatalogProductAggregate({
        costCents: null,
        persistenceMode: "replace",
        row: { id: "produto-1" },
        supabase: client.supabase,
        variationStock: []
      }),
    /modo de persistencia de produto invalido/i
  );
  assert.deepEqual(client.calls, []);
});
