import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath = new URL(
  "../supabase/migrations/20260712210832_normalize_catalog_variations.sql",
  import.meta.url,
);

test("normalizes catalog variations and keeps stock rows aligned", async () => {
  const sql = await readFile(migrationPath, "utf8");

  assert.match(sql, /begin;/i);
  assert.match(sql, /update\s+public\.catalog_products/i);
  assert.match(sql, /delete\s+from\s+public\.catalog_variation_stock/i);
  assert.match(sql, /insert\s+into\s+public\.catalog_variation_stock/i);
  assert.match(sql, /bolsinha-lateral-de-perna/i);
  assert.match(sql, /ponteira-estilo-sc/i);
  assert.match(sql, /Sob consulta/i);
  assert.match(sql, /Fumê/i);
  assert.match(sql, /Alumínio/i);
  assert.match(sql, /Padrão/i);
  assert.match(sql, /commit;/i);
});
