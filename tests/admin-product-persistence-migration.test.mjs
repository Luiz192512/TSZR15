import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationUrl = new URL(
  "../supabase/migrations/20260719223000_atomic_admin_catalog_product.sql",
  import.meta.url
);
const sql = readFileSync(migrationUrl, "utf8");

test("atomic product migration creates a service-role-only RPC", () => {
  assert.match(sql, /create or replace function public\.save_admin_catalog_product/i);
  assert.match(sql, /language plpgsql\s+security invoker\s+set search_path = ''/i);
  assert.match(
    sql,
    /revoke all on function public\.save_admin_catalog_product[\s\S]+from public/i
  );
  assert.match(sql, /from anon/i);
  assert.match(sql, /from authenticated/i);
  assert.match(
    sql,
    /grant execute on function public\.save_admin_catalog_product[\s\S]+to service_role/i
  );
});

test("atomic product RPC updates every part of the product aggregate", () => {
  assert.match(sql, /insert into public\.catalog_products/i);
  assert.match(sql, /update public\.catalog_products/i);
  assert.match(sql, /delete from public\.catalog_variation_stock/i);
  assert.match(sql, /insert into public\.catalog_variation_stock/i);
  assert.match(sql, /delete from public\.catalog_product_costs/i);
  assert.match(sql, /insert into public\.catalog_product_costs/i);
  assert.match(sql, /delete from public\.catalog_product_categories/i);
  assert.match(sql, /insert into public\.catalog_product_categories/i);
});

test("atomic product RPC locks edits and refuses to create a missing product", () => {
  assert.match(
    sql,
    /select catalog_products\.id[\s\S]+from public\.catalog_products[\s\S]+for update/i
  );
  assert.match(sql, /if not found then[\s\S]+produto nao encontrado/i);
});
