import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationUrl = new URL(
  "../supabase/migrations/20260712200537_atomic_admin_order_operation.sql",
  import.meta.url,
);
const sql = readFileSync(migrationUrl, "utf8");

test("atomic admin order migration creates a locked service-role-only RPC", () => {
  assert.match(
    sql,
    /create or replace function public\.save_admin_order_operation/i,
  );
  assert.match(
    sql,
    /language plpgsql\s+security invoker\s+set search_path = ''/i,
  );
  assert.match(sql, /select[\s\S]+from public\.orders[\s\S]+for update/i);
  assert.match(
    sql,
    /revoke all on function public\.save_admin_order_operation[\s\S]+from public/i,
  );
  assert.match(sql, /from anon/i);
  assert.match(sql, /from authenticated/i);
  assert.match(
    sql,
    /grant execute on function public\.save_admin_order_operation[\s\S]+to service_role/i,
  );
});

test("atomic admin order migration protects payment and supplier consistency", () => {
  assert.match(sql, /get diagnostics v_payment_count = row_count/i);
  assert.match(sql, /if v_payment_count = 0 then[\s\S]+raise exception/i);
  assert.match(sql, /supplier_purchases[\s\S]+order_id = p_order_id/i);
  assert.match(sql, /paid_at = case[\s\S]+payments\.paid_at/i);
  assert.match(sql, /insert into public\.supplier_tracking_events/i);
  assert.match(sql, /insert into public\.audit_logs/i);
});

test("atomic admin order migration makes retries idempotent", () => {
  assert.match(sql, /add column if not exists operation_id uuid/i);
  assert.match(sql, /create unique index[\s\S]+audit_logs[\s\S]+operation_id/i);
  assert.match(
    sql,
    /on conflict \(operation_id\) where operation_id is not null do nothing/i,
  );
  assert.match(sql, /metadata -> 'result'/i);
});

test("atomic admin order migration reuses the order supplier row", () => {
  assert.match(
    sql,
    /p_supplier_purchase_id is null[\s\S]+from public\.supplier_purchases[\s\S]+order_id = p_order_id/i,
  );
  assert.match(sql, /on conflict \(id\) do update/i);
});
