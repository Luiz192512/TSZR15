import assert from "node:assert/strict";
import test from "node:test";

import { buildAdminOrderAnalytics } from "../src/admin/order-analytics.js";

test("admin sales analytics count only paid active orders", () => {
  const orders = [
    {
      id: "unpaid-internal-confirmed",
      created_at: "2026-07-11T12:00:00.000Z",
      customer_name: "Unpaid",
      internal_order_status: "confirmado",
      operational_status: "aguardando_pagamento",
      payment_status: "aguardando_pagamento",
      total_cents: 10000,
    },
    {
      id: "paid-undecided",
      created_at: "2026-07-11T13:00:00.000Z",
      customer_name: "Paid",
      internal_order_status: null,
      operational_status: "pagamento_confirmado",
      payment_status: "pagamento_confirmado",
      total_cents: 20000,
    },
    {
      id: "paid-refused",
      created_at: "2026-07-11T14:00:00.000Z",
      customer_name: "Refused",
      internal_order_status: "recusado",
      operational_status: "pagamento_confirmado",
      payment_status: "pagamento_confirmado",
      total_cents: 30000,
    },
    {
      id: "paid-cancelled",
      created_at: "2026-07-11T15:00:00.000Z",
      customer_name: "Cancelled",
      internal_order_status: "confirmado",
      operational_status: "cancelado",
      payment_status: "pagamento_confirmado",
      total_cents: 40000,
    },
  ];

  const analytics = buildAdminOrderAnalytics({
    now: new Date("2026-07-12T12:00:00.000Z"),
    orders,
  });

  assert.equal(analytics.salesCount, 1);
  assert.equal(analytics.totalRevenueCents, 20000);
  assert.deepEqual(
    analytics.topCustomers.map((customer) => customer.name),
    ["Paid"],
  );
});

test("admin sales analytics do not rank customers without paid orders", () => {
  const analytics = buildAdminOrderAnalytics({
    orders: [
      {
        id: "unpaid",
        created_at: "2026-07-11T12:00:00.000Z",
        customer_name: "Unpaid",
        operational_status: "aguardando_pagamento",
        payment_status: "aguardando_pagamento",
        total_cents: 10000,
      },
    ],
  });

  assert.equal(analytics.salesCount, 0);
  assert.deepEqual(analytics.topCustomers, []);
});

test("admin sales analytics group midnight UTC sales in the Brasilia business day", () => {
  const analytics = buildAdminOrderAnalytics({
    now: new Date("2026-07-20T12:00:00.000Z"),
    orders: [
      {
        id: "paid-near-midnight",
        created_at: "2026-07-20T02:30:00.000Z",
        customer_name: "Brasilia Customer",
        operational_status: "pagamento_confirmado",
        payment_status: "pagamento_confirmado",
        total_cents: 25000,
      },
    ],
  });

  assert.equal(analytics.dailySales.find((day) => day.key === "2026-07-19")?.count, 1);
  assert.equal(analytics.dailySales.find((day) => day.key === "2026-07-20")?.count, 0);
});

test("valores ajustados no pedido tem precedencia sobre total e custo derivados", () => {
  const orders = [
    {
      id: "ajustado",
      created_at: "2026-07-11T13:00:00.000Z",
      customer_name: "Ajustado",
      internal_order_status: "confirmado",
      operational_status: "pagamento_confirmado",
      payment_status: "pagamento_confirmado",
      settled_cost_cents: 4000,
      settled_total_cents: 18000,
      total_cents: 20000,
    },
    {
      id: "sem-ajuste",
      created_at: "2026-07-11T14:00:00.000Z",
      customer_name: "Sem ajuste",
      internal_order_status: "confirmado",
      operational_status: "pagamento_confirmado",
      payment_status: "pagamento_confirmado",
      settled_cost_cents: null,
      settled_total_cents: null,
      total_cents: 10000,
    },
  ];
  const supplierPurchases = [
    { order_id: "ajustado", product_cost_cents: 9999, shipping_cost_cents: 9999 },
    { order_id: "sem-ajuste", product_cost_cents: 3000, shipping_cost_cents: 500 },
  ];

  const analytics = buildAdminOrderAnalytics({
    now: new Date("2026-07-12T12:00:00.000Z"),
    orders,
    supplierPurchases,
  });

  // 18000 (ajustado) + 10000 (derivado) — o total_cents de 20000 e ignorado.
  assert.equal(analytics.totalRevenueCents, 28000);
  // 4000 (ajustado) + 3500 (produto+frete) — o custo de fornecedor e ignorado.
  assert.equal(analytics.knownCostCents, 7500);
  assert.equal(analytics.grossProfitCents, 20500);
  assert.equal(analytics.averageTicketCents, 14000);
  assert.equal(
    analytics.topCustomers.find((customer) => customer.name === "Ajustado").totalCents,
    18000
  );
  assert.equal(
    analytics.dailySales.reduce((total, bucket) => total + bucket.totalCents, 0),
    28000
  );
});

test("ajuste zerado e respeitado e nao cai no fallback", () => {
  const analytics = buildAdminOrderAnalytics({
    now: new Date("2026-07-12T12:00:00.000Z"),
    orders: [
      {
        id: "cortesia",
        created_at: "2026-07-11T13:00:00.000Z",
        customer_name: "Cortesia",
        internal_order_status: "confirmado",
        operational_status: "pagamento_confirmado",
        payment_status: "pagamento_confirmado",
        settled_cost_cents: 0,
        settled_total_cents: 0,
        total_cents: 15000,
      },
    ],
    supplierPurchases: [
      { order_id: "cortesia", product_cost_cents: 7000, shipping_cost_cents: 0 },
    ],
  });

  assert.equal(analytics.totalRevenueCents, 0);
  assert.equal(analytics.knownCostCents, 0);
});
