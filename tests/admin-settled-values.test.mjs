import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

const migrationPath =
  "supabase/migrations/20260807190000_admin_settled_order_values.sql";

test("migration adiciona as colunas de ajuste como override nullable", async () => {
  const migration = await source(migrationPath);

  assert.match(migration, /add column if not exists settled_total_cents integer/);
  assert.match(migration, /add column if not exists settled_cost_cents integer/);
  assert.match(migration, /settled_total_cents is null or settled_total_cents >= 0/);
  assert.match(migration, /settled_cost_cents is null or settled_cost_cents >= 0/);

  // Escopo no bloco de ALTER: o corpo da RPC copiado adiante contem "is not null"
  // em varias checagens plpgsql, entao varrer o arquivo inteiro daria falso positivo.
  const alterBlock = migration.slice(0, migration.indexOf("create or replace function"));

  assert.doesNotMatch(
    alterBlock,
    /settled_(total|cost)_cents integer[^;]*\bnot null\b/i,
    "as colunas precisam aceitar NULL = sem ajuste"
  );
});

test("RPC grava os dois ajustes e limpa quando o campo vem vazio", async () => {
  const migration = await source(migrationPath);

  assert.match(migration, /create or replace function public\.save_admin_order_operation/);
  assert.match(
    migration,
    /settled_total_cents = nullif\(p_order ->> 'settledTotalCents', ''\)::integer/
  );
  assert.match(
    migration,
    /settled_cost_cents = nullif\(p_order ->> 'settledCostCents', ''\)::integer/
  );
});

test("analise le todos os pedidos em paginas, sem teto silencioso", async () => {
  const orderAdmin = await source("src/admin/order-admin.js");
  const loader =
    orderAdmin.match(/export async function getAdminOrderAnalytics[\s\S]*?\n\}/)?.[0] ?? "";

  // Dois recortes: o corpo da funcao (paginacao) e a constante de colunas, que
  // fica no escopo de modulo. Assertar os nomes de coluna contra o corpo da
  // funcao seria insatisfazivel — ela so referencia a constante.
  const analyticsColumns =
    orderAdmin.match(/const adminAnalyticsOrderColumns = \[[\s\S]*?\]\.join\(","\)/)?.[0] ?? "";

  assert.notEqual(loader, "", "getAdminOrderAnalytics nao encontrado");
  assert.doesNotMatch(loader, /\.limit\(1000\)/, "teto fixo de 1000 reintroduzido");
  assert.match(loader, /\.range\(/, "a leitura precisa paginar por range");
  assert.match(loader, /\.select\(adminAnalyticsOrderColumns\)/);

  assert.notEqual(analyticsColumns, "", "adminAnalyticsOrderColumns nao encontrada");
  assert.match(analyticsColumns, /"settled_total_cents"/);
  assert.match(analyticsColumns, /"settled_cost_cents"/);
});

test("args da RPC carregam os dois ajustes em centavos", async () => {
  const { buildAdminOrderOperationRpcArgs } = await import(
    "../src/admin/order-operation.js"
  );
  const formData = new FormData();

  // operationId passa por regex de UUID com nibbles de versao [1-8] e variante
  // [89ab]; "enviado" nao existe em operationalStatuses (o valor real e
  // "em_transito"). Os dois fixtures foram validados contra o modulo real.
  formData.set("orderId", "11111111-1111-4111-8111-111111111111");
  formData.set("orderNumber", "TSZ-1");
  formData.set("operationId", "22222222-2222-4222-8222-222222222222");
  formData.set("paymentStatus", "pagamento_confirmado");
  formData.set("operationalStatus", "em_transito");
  formData.set("settledTotal", "189,90");
  formData.set("settledCost", "40,00");

  const args = buildAdminOrderOperationRpcArgs(formData);

  assert.equal(args.p_order.settledTotalCents, "18990");
  assert.equal(args.p_order.settledCostCents, "4000");
});

test("campo de ajuste vazio limpa o override em vez de virar zero", async () => {
  const { buildAdminOrderOperationRpcArgs } = await import(
    "../src/admin/order-operation.js"
  );
  const formData = new FormData();

  // operationId passa por regex de UUID com nibbles de versao [1-8] e variante
  // [89ab]; "enviado" nao existe em operationalStatuses (o valor real e
  // "em_transito"). Os dois fixtures foram validados contra o modulo real.
  formData.set("orderId", "11111111-1111-4111-8111-111111111111");
  formData.set("orderNumber", "TSZ-1");
  formData.set("operationId", "22222222-2222-4222-8222-222222222222");
  formData.set("paymentStatus", "pagamento_confirmado");
  formData.set("operationalStatus", "em_transito");
  formData.set("settledTotal", "");
  formData.set("settledCost", "");

  const args = buildAdminOrderOperationRpcArgs(formData);

  assert.equal(args.p_order.settledTotalCents, "");
  assert.equal(args.p_order.settledCostCents, "");
});

test("formulario do pedido expoe os dois campos de ajuste", async () => {
  const view = await source("app/admin/_components/admin-orders-view.js");

  assert.match(view, /name="settledTotal"/);
  assert.match(view, /name="settledCost"/);
  assert.match(view, /Valor efetivamente recebido/);
  assert.match(view, /Custo total real/);
});

test("colunas do pedido selecionado incluem os ajustes", async () => {
  const orderAdmin = await source("src/admin/order-admin.js");
  const columns =
    orderAdmin.match(/const adminOrderDetailColumns = \[[\s\S]*?\]\.join\(","\)/)?.[0] ?? "";

  assert.match(columns, /"settled_total_cents"/);
  assert.match(columns, /"settled_cost_cents"/);
});
