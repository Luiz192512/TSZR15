import assert from "node:assert/strict";
import test from "node:test";

import {
  archiveAdminCouponById,
  saveAdminCoupon,
} from "../src/admin/catalog-coupon-persistence.js";

function createSupabaseQuery(result) {
  const calls = [];
  const query = {
    calls,
    eq(column, value) {
      calls.push(["eq", column, value]);
      return query;
    },
    insert(row) {
      calls.push(["insert", row]);
      return query;
    },
    maybeSingle() {
      calls.push(["maybeSingle"]);
      return Promise.resolve(result);
    },
    select(columns) {
      calls.push(["select", columns]);
      return query;
    },
    single() {
      calls.push(["single"]);
      return Promise.resolve(result);
    },
    update(row) {
      calls.push(["update", row]);
      return query;
    },
  };

  return {
    query,
    supabase: {
      from(table) {
        calls.push(["from", table]);
        return query;
      },
    },
  };
}

test("saving an existing coupon renames the same UUID", async () => {
  const { query, supabase } = createSupabaseQuery({
    data: { code: "R15NEW", id: "2f109043-9686-4799-8a66-56d89e99ed86" },
    error: null,
  });
  const row = { code: "R15NEW", discount_type: "percent" };

  const result = await saveAdminCoupon({
    couponId: "2f109043-9686-4799-8a66-56d89e99ed86",
    row,
    supabase,
  });

  assert.deepEqual(result, {
    code: "R15NEW",
    id: "2f109043-9686-4799-8a66-56d89e99ed86",
  });
  assert.deepEqual(query.calls, [
    ["from", "catalog_coupons"],
    ["update", row],
    ["eq", "id", "2f109043-9686-4799-8a66-56d89e99ed86"],
    ["select", "id, code"],
    ["maybeSingle"],
  ]);
});

test("saving a new coupon inserts a new row", async () => {
  const { query, supabase } = createSupabaseQuery({
    data: { code: "R15NEW", id: "5e72dc26-b52d-4e40-8818-e252ee394c60" },
    error: null,
  });
  const row = { code: "R15NEW" };

  await saveAdminCoupon({ couponId: "", row, supabase });

  assert.deepEqual(query.calls, [
    ["from", "catalog_coupons"],
    ["insert", row],
    ["select", "id, code"],
    ["single"],
  ]);
});

test("saving a duplicate coupon code returns a friendly error", async () => {
  const { supabase } = createSupabaseQuery({
    data: null,
    error: { code: "23505", message: "duplicate key value" },
  });

  await assert.rejects(
    saveAdminCoupon({ couponId: "", row: { code: "R15" }, supabase }),
    /Ja existe um cupom com este codigo\./,
  );
});

test("archiving a coupon targets its immutable UUID", async () => {
  const { query, supabase } = createSupabaseQuery({
    data: { code: "R15OFF", id: "65e26a19-cf3a-482f-ad5e-498dbd61be8e" },
    error: null,
  });

  const result = await archiveAdminCouponById({
    couponId: "65e26a19-cf3a-482f-ad5e-498dbd61be8e",
    supabase,
  });

  assert.equal(result.code, "R15OFF");
  assert.deepEqual(query.calls, [
    ["from", "catalog_coupons"],
    ["update", { is_active: false }],
    ["eq", "id", "65e26a19-cf3a-482f-ad5e-498dbd61be8e"],
    ["select", "id, code"],
    ["maybeSingle"],
  ]);
});
