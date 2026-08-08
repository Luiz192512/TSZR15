import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

const migrationPath =
  "supabase/migrations/20260807190000_admin_settled_order_values.sql";

test("migration adiciona as colunas de ajuste como override nullable", async () => {
  const migration = await source(migrationPath);

  assert.match(migration, /add column if not exists settled_total_cents integer/);
  assert.match(migration, /add column if not exists settled_cost_cents integer/);
  assert.match(migration, /settled_total_cents is null or settled_total_cents >= 0/);
  assert.match(migration, /settled_cost_cents is null or settled_cost_cents >= 0/);

  // Escopo no bloco de ALTER: o corpo da RPC copiado adiante contem "is not null"
  // em varias checagens plpgsql, entao varrer o arquivo inteiro daria falso positivo.
  const alterBlock = migration.slice(0, migration.indexOf("create or replace function"));

  assert.doesNotMatch(
    alterBlock,
    /settled_(total|cost)_cents integer[^;]*\bnot null\b/i,
    "as colunas precisam aceitar NULL = sem ajuste"
  );
});

test("RPC grava os dois ajustes e limpa quando o campo vem vazio", async () => {
  const migration = await source(migrationPath);

  assert.match(migration, /create or replace function public\.save_admin_order_operation/);
  assert.match(
    migration,
    /settled_total_cents = nullif\(p_order ->> 'settledTotalCents', ''\)::integer/
  );
  assert.match(
    migration,
    /settled_cost_cents = nullif\(p_order ->> 'settledCostCents', ''\)::integer/
  );
});
