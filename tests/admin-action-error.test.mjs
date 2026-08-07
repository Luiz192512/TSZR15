import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  createAdminDatabaseError,
  getAdminActionErrorState,
  isInternalAdminError
} from "../src/admin/admin-action-error.js";

function collectLogs() {
  const entries = [];

  return {
    entries,
    logEvent(level, event, details) {
      entries.push({ details, event, level });
    }
  };
}

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("erro de driver marcado nao vaza detalhe interno para o usuario", () => {
  const supabaseError = {
    code: "23505",
    details: "Key (slug)=(slider-r15) already exists.",
    hint: null,
    message: 'duplicate key value violates unique constraint "catalog_products_slug_key"'
  };
  const wrapped = createAdminDatabaseError(supabaseError, "gravar produto do catalogo");
  const log = collectLogs();
  const state = getAdminActionErrorState(wrapped, { logEvent: log.logEvent, reference: "ADM-TESTE" });

  assert.equal(state.isInternal, true);
  assert.doesNotMatch(state.message, /duplicate key|constraint|catalog_products_slug_key|slider-r15/i);
  assert.match(state.message, /ADM-TESTE/);
  assert.equal(state.reference, "ADM-TESTE");
});

test("detalhe do driver fica no log do servidor, nao na mensagem", () => {
  const supabaseError = {
    code: "42501",
    message: 'permission denied for table orders'
  };
  const wrapped = createAdminDatabaseError(supabaseError, "listar pedidos");
  const log = collectLogs();

  getAdminActionErrorState(wrapped, { logEvent: log.logEvent, reference: "ADM-XYZ" });

  assert.equal(log.entries.length, 1);
  assert.equal(log.entries[0].level, "error");
  assert.equal(log.entries[0].event, "admin_action_failed");
  assert.equal(log.entries[0].details.errorDetail, "permission denied for table orders");
  assert.equal(log.entries[0].details.errorCode, "42501");
  assert.equal(log.entries[0].details.operation, "listar pedidos");
  assert.equal(log.entries[0].details.reference, "ADM-XYZ");
});

test("mensagem de validacao do proprio painel chega intacta ao usuario", () => {
  const log = collectLogs();
  const state = getAdminActionErrorState(new Error("Informe um percentual entre 1 e 100."), {
    logEvent: log.logEvent
  });

  assert.equal(state.isInternal, false);
  assert.equal(state.message, "Informe um percentual entre 1 e 100.");
  assert.equal(state.reference, "");
  assert.equal(log.entries.length, 0);
});

test("erro de driver nao marcado ainda e barrado pela rede secundaria", () => {
  const naoMarcados = [
    new Error('relation "catalog_coupons" does not exist'),
    new Error("permission denied for table order_items"),
    new Error('new row violates row-level security policy for table "orders"'),
    new Error("PGRST204 column not found in schema cache"),
    new Error("    at getAdminOrder (/app/src/admin/order-admin.js:216:11)")
  ];

  for (const error of naoMarcados) {
    const log = collectLogs();
    const state = getAdminActionErrorState(error, { logEvent: log.logEvent, reference: "ADM-1" });

    assert.equal(state.isInternal, true, `deveria mascarar: ${error.message}`);
    assert.doesNotMatch(state.message, /relation|permission denied|row-level|schema cache|order-admin/i);
  }
});

test("objeto de erro com metadados do Postgres e tratado como interno", () => {
  const log = collectLogs();
  const state = getAdminActionErrorState(
    Object.assign(new Error("falha generica"), { code: "XX000", details: "internal" }),
    { logEvent: log.logEvent, reference: "ADM-2" }
  );

  assert.equal(state.isInternal, true);
  assert.equal(isInternalAdminError(state), false);
});

test("actions do admin nunca mandam error.message direto para a URL", async () => {
  const actions = await source("app/admin/actions.js");

  assert.doesNotMatch(actions, /redirectWithError\([^)]*error\.message/);
  assert.doesNotMatch(actions, /error:\s*error\.message/);
  assert.match(actions, /getAdminActionErrorState/);
});

test("modulos do admin propagam erro de banco pelo wrapper, nao pelo texto cru", async () => {
  const modulos = [
    "src/admin/catalog-admin.js",
    "src/admin/catalog-product-images.js",
    "src/admin/catalog-product-persistence.js",
    "src/admin/order-admin.js",
    "src/admin/order-operation.js"
  ];

  for (const modulo of modulos) {
    const conteudo = await source(modulo);

    assert.doesNotMatch(
      conteudo,
      /throw new Error\((?:error|firstError|orderError|correctedError)\.message\)/,
      `${modulo} ainda propaga mensagem crua de driver`
    );
  }
});
