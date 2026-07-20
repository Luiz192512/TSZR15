import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  CheckoutStockError,
  persistCheckoutOrder
} from "../src/checkout/order-backend.js";

const migrationUrl = new URL(
  "../supabase/migrations/20260720031500_atomic_checkout_stock_reservation.sql",
  import.meta.url
);
const sql = readFileSync(migrationUrl, "utf8");

test("migracao inclui os pre-requisitos da operacao de pedido nunca aplicados", () => {
  assert.match(sql, /alter table public\.audit_logs\s+add column if not exists operation_id uuid/i);
  assert.match(sql, /create unique index if not exists audit_logs_admin_operation_id_idx/i);
});

test("checkout reserva estoque com lock e falha com marcador estavel quando insuficiente", () => {
  const checkoutBody = sql.slice(
    sql.indexOf("create or replace function public.create_checkout_order"),
    sql.indexOf("create or replace function public.save_admin_order_operation")
  );

  assert.ok(checkoutBody.length > 0, "migracao deve redefinir create_checkout_order");
  assert.match(checkoutBody, /security invoker/i);
  assert.match(checkoutBody, /set search_path = ''/i);
  assert.match(
    checkoutBody,
    /from public\.catalog_variation_stock[\s\S]*?for update/i
  );
  assert.match(checkoutBody, /raise exception 'estoque_insuficiente:%\|%'/i);
  assert.match(
    checkoutBody,
    /set quantity = v_stock_quantity - v_item_quantity/i
  );
  assert.match(checkoutBody, /quantity is not null/i);
});

test("cancelamento devolve estoque e des-cancelamento re-reserva com a mesma checagem", () => {
  const operationBody = sql.slice(
    sql.indexOf("create or replace function public.save_admin_order_operation")
  );

  assert.ok(operationBody.length > 0, "migracao deve redefinir save_admin_order_operation");
  assert.match(operationBody, /security invoker/i);
  assert.match(operationBody, /set search_path = ''/i);
  assert.match(operationBody, /v_previous_operational_status/);
  assert.match(
    operationBody,
    /is distinct from 'cancelado' and v_operational_status = 'cancelado'/i
  );
  assert.match(
    operationBody,
    /= 'cancelado' and v_operational_status is distinct from 'cancelado'/i
  );
  assert.match(operationBody, /quantity \+ /);
  assert.match(operationBody, /raise exception 'estoque_insuficiente:%\|%'/i);
  assert.match(operationBody, /grant execute on function public\.save_admin_order_operation[\s\S]+to service_role/i);
  assert.match(operationBody, /revoke all on function public\.save_admin_order_operation[\s\S]+from authenticated/i);
});

test("persistCheckoutOrder converte o marcador de estoque em erro amigavel 409", async () => {
  const draft = {
    addressSnapshot: {},
    consentSnapshot: {},
    customerSnapshot: { name: "Cliente" },
    databaseItems: [
      {
        name: "Slider Esportivo",
        productId: "slider",
        quantity: 2,
        variation: "Preto"
      }
    ],
    message: "msg",
    payment: { id: "pix" },
    shipping: { id: "pac" },
    totals: {}
  };
  const supabase = {
    async rpc() {
      return {
        data: null,
        error: { message: "estoque_insuficiente:slider|Preto" }
      };
    }
  };

  await assert.rejects(
    () => persistCheckoutOrder({ draft, supabase, user: { id: "user-1" } }),
    (error) => {
      assert.ok(error instanceof CheckoutStockError);
      assert.match(error.message, /Slider Esportivo/);
      assert.match(error.message, /Preto/);
      assert.doesNotMatch(error.message, /estoque_insuficiente:/);
      return true;
    }
  );
});

test("persistCheckoutOrder mantem erro generico para outras falhas de persistencia", async () => {
  const draft = {
    addressSnapshot: {},
    consentSnapshot: {},
    customerSnapshot: { name: "Cliente" },
    databaseItems: [],
    message: "msg",
    payment: { id: "pix" },
    shipping: { id: "pac" },
    totals: {}
  };
  const supabase = {
    async rpc() {
      return { data: null, error: { message: "duplicate key value" } };
    }
  };

  await assert.rejects(
    () => persistCheckoutOrder({ draft, supabase, user: { id: "user-1" } }),
    (error) => error.name === "CheckoutPersistenceError"
  );
});

test("rota de checkout devolve 409 para CheckoutStockError sem vazar erro interno", () => {
  const routeSource = readFileSync(
    new URL("../app/api/checkout/whatsapp/route.js", import.meta.url),
    "utf8"
  );

  assert.match(routeSource, /CheckoutStockError/);
  assert.match(routeSource, /instanceof CheckoutStockError/);
  assert.match(routeSource, /409/);
});
