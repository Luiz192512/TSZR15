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
