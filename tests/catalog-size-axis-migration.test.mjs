import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath = new URL(
  "../supabase/migrations/20260814090000_catalog_size_axis.sql",
  import.meta.url,
);

test("migracao adiciona o eixo de tamanho sem backfill e sem quebrar linhas atuais", async () => {
  const sql = await readFile(migrationPath, "utf8");

  assert.match(sql, /begin;/i);
  assert.match(
    sql,
    /alter table public\.catalog_products\s+add column if not exists size_options text\[\] not null default '\{\}'/i,
  );
  assert.match(
    sql,
    /alter table public\.catalog_variation_stock\s+add column if not exists size text not null default ''/i,
  );
  assert.match(
    sql,
    /alter table public\.order_items\s+add column if not exists size text not null default ''/i,
  );
  assert.match(sql, /commit;/i);

  // Nenhum UPDATE de backfill: as linhas existentes ficam com size = '' pelo default.
  assert.equal(/update\s+public\./i.test(sql), false);
});

test("migracao troca a chave primaria do estoque para incluir o tamanho", async () => {
  const sql = await readFile(migrationPath, "utf8");

  assert.match(
    sql,
    /drop constraint if exists catalog_variation_stock_pkey/i,
  );
  assert.match(
    sql,
    /primary key \(product_id, variation, size\)/i,
  );
});

test("migracao cria a categoria de vestuario de forma idempotente", async () => {
  const sql = await readFile(migrationPath, "utf8");

  assert.match(sql, /insert into public\.catalog_categories/i);
  assert.match(sql, /'vestuario'/);
  assert.match(sql, /on conflict \(id\) do nothing/i);
});

test("migracao nao reintroduz grants amplos nem funcao security definer", async () => {
  const sql = await readFile(migrationPath, "utf8");
  const statements = sql
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");

  assert.equal(/\bgrant\b/i.test(statements), false);
  assert.equal(/security\s+definer/i.test(statements), false);
});
