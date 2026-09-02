import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath =
  "supabase/migrations/20260807210000_revoke_internal_column_grants.sql";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

const tabelasOperacionais = [
  "orders",
  "order_items",
  "payments",
  "supplier_purchases",
  "supplier_tracking_events",
  "audit_logs",
  "support_threads"
];

test("migration revoga os grants amplos das tabelas operacionais", async () => {
  const migration = await source(migrationPath);

  for (const tabela of tabelasOperacionais) {
    assert.match(
      migration,
      new RegExp(`revoke all on table public\\.${tabela} from anon, authenticated;`),
      `${tabela} sem revoke`
    );
  }
});

test("migration nao mexe em service_role nem remove as policies", async () => {
  const migration = await source(migrationPath);

  assert.doesNotMatch(
    migration,
    /revoke[\s\S]*from[^;]*service_role/i,
    "service_role e o unico caminho de leitura do app"
  );
  assert.doesNotMatch(
    migration,
    /drop policy/i,
    "as policies ficam como defesa em profundidade"
  );
});

test("a consulta de auditoria de grants esta documentada", async () => {
  const doc = await source("docs/ENVIRONMENT.md");

  assert.match(doc, /information_schema\.column_privileges/);
  assert.match(doc, /grantee IN \('anon', 'authenticated'\)/);
  assert.match(doc, /Colunas internas expostas/);
});

// Tabela de dinheiro que nasce depois precisa entrar na auditoria, senao ela
// passa a existir fora do radar da consulta que guarda custo e margem.
test("as tabelas de dinheiro da fase 3 entram na auditoria", async () => {
  const doc = await source("docs/ENVIRONMENT.md");

  for (const tabela of ["order_ledger", "payment_webhook_events"]) {
    assert.match(doc, new RegExp(`'${tabela}'`), `${tabela} fora da consulta de auditoria`);
  }
});
