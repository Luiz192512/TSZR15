import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath = new URL(
  "../supabase/migrations/20260817120000_revoke_catalog_write_grants.sql",
  import.meta.url,
);

test("migracao revoga escrita das tabelas de catalogo para anon e authenticated", async () => {
  const sql = await readFile(migrationPath, "utf8");

  for (const table of [
    "catalog_products",
    "catalog_variation_stock",
    "catalog_categories",
    "catalog_product_categories",
  ]) {
    assert.match(
      sql,
      new RegExp(
        `revoke insert, update, delete, truncate on table public\\.${table} from anon, authenticated;`,
        "i",
      ),
      `${table} deveria perder as permissoes de escrita`,
    );
  }
});

test("migracao preserva o select publico e nao mexe em service_role nem nas policies", async () => {
  const sql = await readFile(migrationPath, "utf8");
  const statements = sql
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");

  assert.equal(/revoke[^;]*\bselect\b/i.test(statements), false);
  assert.equal(/service_role/i.test(statements), false);
  assert.equal(/drop policy/i.test(statements), false);
  assert.equal(/\bgrant\b/i.test(statements), false);
});
