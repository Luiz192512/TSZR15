import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationUrl = new URL(
  "../supabase/migrations/20260720130000_stock_reservation_hardening.sql",
  import.meta.url
);
const sql = readFileSync(migrationUrl, "utf8");

const functionNames = [
  "release_order_stock",
  "reserve_order_stock",
  "create_checkout_order",
  "save_admin_order_operation",
  "set_admin_internal_order_status"
];

function sliceFunction(name) {
  const start = sql.indexOf(`create or replace function public.${name}`);
  assert.ok(start >= 0, `migracao deve definir ${name}`);
  const nextStarts = functionNames
    .map((candidate) => sql.indexOf(`create or replace function public.${candidate}`))
    .filter((index) => index > start);
  return sql.slice(start, nextStarts.length ? Math.min(...nextStarts) : sql.length);
}

test("order_items ganha a marcacao de reserva efetiva de estoque", () => {
  assert.match(
    sql,
    /alter table public\.order_items\s+add column if not exists stock_reserved boolean not null default false/i
  );
});

test("reserva compartilhada trava em ordem deterministica e marca somente itens nao reservados", () => {
  const body = sliceFunction("reserve_order_stock");

  assert.match(body, /group by 1, 2\s+order by 1, 2/i);
  assert.match(body, /for update/i);
  assert.match(body, /raise exception 'estoque_insuficiente:%\|%'/i);
  assert.match(body, /not order_items\.stock_reserved/i);
  assert.match(body, /set stock_reserved = true/i);
});

test("devolucao compartilhada credita somente itens com reserva efetiva e limpa a flag", () => {
  const body = sliceFunction("release_order_stock");

  assert.match(body, /order_items\.stock_reserved/i);
  assert.match(body, /quantity \+ v_stock_item\.total_quantity/i);
  assert.match(body, /quantity is not null/i);
  assert.match(body, /set stock_reserved = false/i);
  assert.match(body, /group by 1, 2\s+order by 1, 2/i);
});

test("checkout usa a reserva compartilhada em vez de decrementar no loop de itens", () => {
  const body = sliceFunction("create_checkout_order");

  assert.match(body, /perform public\.reserve_order_stock\(v_order_id\)/i);
  assert.doesNotMatch(body, /set quantity = v_stock_quantity/i);
});

test("cancelamento operacional devolve e des-cancelamento re-reserva via helpers", () => {
  const body = sliceFunction("save_admin_order_operation");

  assert.match(body, /is distinct from 'cancelado' and v_operational_status = 'cancelado'/i);
  assert.match(body, /perform public\.release_order_stock\(p_order_id\)/i);
  assert.match(body, /= 'cancelado' and v_operational_status is distinct from 'cancelado'/i);
  assert.match(body, /perform public\.reserve_order_stock\(p_order_id\)/i);
});

test("status interno recusado passa por RPC que libera e re-reserva estoque", () => {
  const body = sliceFunction("set_admin_internal_order_status");

  assert.match(body, /security invoker/i);
  assert.match(body, /set search_path = ''/i);
  assert.match(body, /is distinct from 'recusado' and p_internal_status = 'recusado'/i);
  assert.match(body, /= 'recusado' and p_internal_status is distinct from 'recusado'/i);
  assert.match(body, /perform public\.release_order_stock\(p_order_id\)/i);
  assert.match(body, /perform public\.reserve_order_stock\(p_order_id\)/i);
  assert.match(body, /internal_order_status_updated_at/);
  assert.match(body, /admin_internal_order_status_updated/);
  assert.match(
    sql,
    /grant execute on function public\.set_admin_internal_order_status[\s\S]+?to service_role/i
  );
  assert.match(
    sql,
    /revoke all on function public\.set_admin_internal_order_status[\s\S]+?from authenticated/i
  );
});

test("checkout RPC e helpers deixam de ser executaveis por authenticated", () => {
  assert.match(
    sql,
    /revoke all on function public\.create_checkout_order[\s\S]+?from authenticated/i
  );
  assert.match(sql, /revoke all on function public\.reserve_order_stock[\s\S]+?from authenticated/i);
  assert.match(sql, /revoke all on function public\.release_order_stock[\s\S]+?from authenticated/i);
});

test("acao de status interno do admin usa a RPC transacional", () => {
  const orderAdminSource = readFileSync(
    new URL("../src/admin/order-admin.js", import.meta.url),
    "utf8"
  );

  assert.match(orderAdminSource, /rpc\("set_admin_internal_order_status"/);
  assert.doesNotMatch(
    orderAdminSource,
    /internal_order_status: internalOrderStatus,\s*internal_order_status_updated_at/
  );
});
