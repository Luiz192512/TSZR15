import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath = new URL(
  "../supabase/migrations/20260825120000_payment_ledger_and_webhooks.sql",
  import.meta.url
);

async function sql() {
  return readFile(migrationPath, "utf8");
}

test("migracao e transacional e aditiva", async () => {
  const text = await sql();

  assert.match(text, /begin;/i);
  assert.match(text, /commit;/i);

  // Nada de reescrever linha existente nem apagar coluna/tabela.
  assert.equal(/update\s+public\./i.test(text), false, "nao deve fazer backfill");
  assert.equal(/drop\s+table/i.test(text), false, "nao deve derrubar tabela");
  assert.equal(/drop\s+column/i.test(text), false, "nao deve derrubar coluna");
  assert.equal(/delete\s+from/i.test(text), false, "nao deve apagar linha");
});

test("payments ganha o que o provedor externo exige", async () => {
  const text = await sql();

  for (const column of [
    "provider_payment_id text",
    "settled_amount_cents integer",
    "provider_fee_cents integer not null default 0",
    "refunded_amount_cents integer not null default 0",
    "expires_at timestamptz",
    "provider_payload jsonb not null default '\\{\\}'::jsonb"
  ]) {
    assert.match(
      text,
      new RegExp(`add column if not exists ${column}`, "i"),
      `coluna ausente: ${column}`
    );
  }
});

// O CHECK antigo aceitava quatro valores. Ampliar e aditivo; remover algum
// deles invalidaria pedidos ja gravados.
test("o CHECK de status amplia sem perder nenhum valor antigo", async () => {
  const text = await sql();

  for (const status of [
    "aguardando_pagamento",
    "pagamento_confirmado",
    "cancelado",
    "reembolsado"
  ]) {
    assert.match(text, new RegExp(`'${status}'`), `status antigo removido: ${status}`);
  }

  for (const status of ["expirado", "autorizado", "recusado", "em_analise", "estornado"]) {
    assert.match(text, new RegExp(`'${status}'`), `status novo ausente: ${status}`);
  }
});

// Sem esta UNIQUE o webhook confirma o mesmo pagamento a cada reenvio.
test("webhook tem deduplicacao por identificador de evento", async () => {
  const text = await sql();

  assert.match(text, /create table if not exists public\.payment_webhook_events/i);
  assert.match(
    text,
    /create unique index if not exists payment_webhook_events_provider_event_idx\s+on public\.payment_webhook_events \(provider, provider_event_id\)/i
  );
  assert.match(text, /signature_valid boolean not null default false/i);
});

test("ledger cobre a divisao do dinheiro de ponta a ponta", async () => {
  const text = await sql();

  assert.match(text, /create table if not exists public\.order_ledger/i);

  for (const column of [
    "charged_amount_cents",
    "settled_amount_cents",
    "provider_fee_cents",
    "refunded_amount_cents",
    "estimated_cost_cents",
    "actual_cost_cents",
    "provisional_margin_cents",
    "reconciled_margin_cents",
    "payout_status",
    "payout_amount_cents",
    "payout_at",
    "payout_reference",
    "payout_approved_by"
  ]) {
    assert.match(text, new RegExp(`\\b${column}\\b`), `coluna do ledger ausente: ${column}`);
  }

  assert.match(text, /payout_status in \('pendente', 'repassado', 'estornado', 'nao_aplicavel'\)/i);
});

// Prejuizo e resultado legitimo: o custo real pode superar o estimado. Um
// CHECK de nao-negatividade na margem esconderia exatamente o caso que o dono
// precisa enxergar no painel.
test("margem aceita valor negativo", async () => {
  const text = await sql();

  assert.doesNotMatch(text, /provisional_margin_cents[^,]*check[^,]*>=\s*0/i);
  assert.doesNotMatch(text, /reconciled_margin_cents[^,]*check[^,]*>=\s*0/i);
});

test("repasse executado exige quem aprovou, quando e quanto", async () => {
  const text = await sql();

  assert.match(text, /order_ledger_payout_requires_approval/i);
  assert.match(text, /payout_status <> 'repassado'/i);
  assert.match(text, /payout_at is not null/i);
  assert.match(text, /payout_approved_by is not null/i);
});

test("automacao de fornecedor tem chave de idempotencia e origem", async () => {
  const text = await sql();

  assert.match(text, /add column if not exists created_by text not null default 'manual'/i);
  assert.match(text, /created_by in \('manual', 'automacao'\)/i);
  assert.match(text, /add column if not exists automation_key text/i);
  assert.match(
    text,
    /create unique index if not exists supplier_purchases_automation_key_idx\s+on public\.supplier_purchases \(automation_key\)\s+where automation_key is not null/i
  );
});

// Taxa, custo e margem nao podem sair pelo PostgREST. As tabelas nascem sem
// grant; sem estes revokes, um GRANT amplo futuro levaria as colunas novas
// junto. Guardado tambem por tests/rls-column-exposure.test.mjs.
test("tabelas de dinheiro nascem fechadas para anon e authenticated", async () => {
  const text = await sql();

  for (const table of [
    "payment_webhook_events",
    "order_ledger",
    "payments",
    "supplier_purchases"
  ]) {
    assert.match(
      text,
      new RegExp(`revoke all on table public\\.${table} from anon, authenticated`, "i"),
      `revoke ausente: ${table}`
    );
  }

  assert.match(text, /alter table public\.payment_webhook_events enable row level security/i);
  assert.match(text, /alter table public\.order_ledger enable row level security/i);
});
