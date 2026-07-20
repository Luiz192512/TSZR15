import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { fetchRowsForOrderIds, orderIdChunkSize } from "../src/admin/order-related-rows.js";

function orderIds(count) {
  return Array.from({ length: count }, (_, index) => `order-${index}`);
}

test("consultas relacionadas a pedidos sao divididas em lotes de ids", async () => {
  const chunkSizes = [];
  const { data, error } = await fetchRowsForOrderIds({
    buildQuery: async (chunk) => {
      chunkSizes.push(chunk.length);
      return { data: chunk.map((id) => ({ order_id: id })), error: null };
    },
    orderIds: orderIds(350)
  });

  assert.equal(error, null);
  assert.deepEqual(chunkSizes, [150, 150, 50]);
  assert.equal(data.length, 350);
  assert.equal(data[0].order_id, "order-0");
  assert.equal(data[349].order_id, "order-349");
});

test("lote padrao mantem a URL do PostgREST abaixo dos limites de proxy", () => {
  assert.ok(orderIdChunkSize <= 200);
});

test("sem pedidos nao ha consulta e o resultado e vazio", async () => {
  let calls = 0;
  const { data, error } = await fetchRowsForOrderIds({
    buildQuery: async () => {
      calls += 1;
      return { data: [{ order_id: "x" }], error: null };
    },
    orderIds: []
  });

  assert.equal(calls, 0);
  assert.equal(error, null);
  assert.deepEqual(data, []);
});

test("erro de qualquer lote e propagado como erro unico", async () => {
  const { data, error } = await fetchRowsForOrderIds({
    buildQuery: async (chunk) =>
      chunk[0] === "order-150"
        ? { data: null, error: { message: "lote falhou" } }
        : { data: chunk.map((id) => ({ order_id: id })), error: null },
    orderIds: orderIds(350)
  });

  assert.equal(error?.message, "lote falhou");
  assert.equal(data, null);
});

test("analytics admin consulta custos e itens por lote do mesmo conjunto de pedidos", async () => {
  const orderAdminSource = await readFile(
    new URL("../src/admin/order-admin.js", import.meta.url),
    "utf8"
  );

  assert.match(orderAdminSource, /fetchRowsForOrderIds\(\{/);
  assert.match(
    orderAdminSource,
    /\.from\("supplier_purchases"\)[\s\S]*?\.in\("order_id", chunk\)/
  );
  assert.match(orderAdminSource, /\.from\("order_items"\)[\s\S]*?\.in\("order_id", chunk\)/);
  assert.doesNotMatch(orderAdminSource, /\.in\("order_id", orderIds\)/);
});
