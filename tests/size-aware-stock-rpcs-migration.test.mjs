import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath = new URL(
  "../supabase/migrations/20260814093000_size_aware_stock_rpcs.sql",
  import.meta.url,
);

async function readMigration() {
  return readFile(migrationPath, "utf8");
}

test("reserva e devolucao agrupam e travam por produto, variacao e tamanho", async () => {
  const sql = await readMigration();
  const reserve = sql.slice(sql.indexOf("function public.reserve_order_stock"));
  const release = sql.slice(
    sql.indexOf("function public.release_order_stock"),
    sql.indexOf("function public.reserve_order_stock"),
  );

  for (const body of [reserve.slice(0, reserve.indexOf("$$;")), release]) {
    assert.match(body, /group by 1, 2, 3/i);
    assert.match(body, /catalog_variation_stock\.size = v_stock_item\.size/i);
  }

  assert.match(reserve, /for update/i);
  assert.match(reserve, /estoque_insuficiente:%\|%\|%/);
});

test("checkout grava o tamanho do item e mantem a reserva pelo helper", async () => {
  const sql = await readMigration();
  const checkout = sql.slice(sql.indexOf("function public.create_checkout_order"));

  assert.match(checkout, /coalesce\(v_item ->> 'size', ''\)/);
  assert.match(checkout, /perform public\.reserve_order_stock\(v_order_id\)/i);
});

test("save de produto grava size_options e faz upsert por chave tripla", async () => {
  const sql = await readMigration();
  const save = sql.slice(
    sql.indexOf("function public.save_admin_catalog_product"),
    sql.indexOf("function public.release_order_stock"),
  );

  assert.match(save, /size_options/);
  assert.match(save, /coalesce\(stock_row ->> 'size', ''\)/);
  assert.match(save, /on conflict \(product_id, variation, size\) do update/i);
});

test("funcoes seguem security invoker, search_path vazio e execucao so por service_role", async () => {
  const sql = await readMigration();
  const definitions = sql.match(/create or replace function/gi) ?? [];

  assert.equal(definitions.length, 4);
  assert.equal((sql.match(/security invoker/gi) ?? []).length, 4);
  assert.equal((sql.match(/set search_path = ''/gi) ?? []).length, 4);
  assert.equal(/security\s+definer/i.test(sql), false);

  for (const routine of [
    "save_admin_catalog_product",
    "release_order_stock",
    "reserve_order_stock",
    "create_checkout_order",
  ]) {
    assert.match(
      sql,
      new RegExp(`revoke all on function public\\.${routine}[\\s\\S]{0,200}?from anon;`, "i"),
      `${routine} deveria ser revogada para anon`,
    );
    assert.match(
      sql,
      new RegExp(
        `revoke all on function public\\.${routine}[\\s\\S]{0,200}?from authenticated;`,
        "i",
      ),
      `${routine} deveria ser revogada para authenticated`,
    );
    assert.match(
      sql,
      new RegExp(`grant execute on function public\\.${routine}[\\s\\S]{0,200}?to service_role;`, "i"),
      `${routine} deveria ser executavel por service_role`,
    );
  }
});
