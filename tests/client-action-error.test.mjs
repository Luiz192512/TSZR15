import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  createInternalActionError,
  getSafeActionErrorState,
  isInternalActionError
} from "../src/lib/action-error.js";

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

// Payloads reais do PostgREST/Postgres, do formato que o supabase-js entrega.
const postgresErrors = [
  {
    code: "23505",
    details: "Key (user_id, cep, number)=(a1b2, 87010-000, 120) already exists.",
    hint: null,
    message:
      'duplicate key value violates unique constraint "customer_addresses_user_cep_number_key"'
  },
  {
    code: "42501",
    details: null,
    hint: null,
    message: 'new row violates row-level security policy for table "customer_addresses"'
  },
  {
    code: "23503",
    details: 'Key (user_id)=(a1b2) is not present in table "users".',
    hint: null,
    message: 'insert or update on table "customer_addresses" violates foreign key constraint'
  },
  {
    code: "PGRST204",
    details: null,
    hint: null,
    message: "Could not find the 'reference_point' column of 'customer_addresses' in the schema cache"
  }
];

test("erro de Postgres nunca chega ao cliente com detalhe interno", () => {
  for (const postgresError of postgresErrors) {
    const log = collectLogs();
    const state = getSafeActionErrorState(postgresError, {
      fallbackMessage: "Nao foi possivel salvar este endereco.",
      logEvent: log.logEvent,
      prefix: "PED",
      reference: "PED-4F2A91"
    });

    assert.equal(state.isInternal, true, `deveria mascarar: ${postgresError.message}`);
    assert.doesNotMatch(
      state.message,
      /duplicate key|constraint|row-level security|schema cache|customer_addresses|user_id|87010-000/i
    );
    assert.match(state.message, /PED-4F2A91/);
  }
});

test("a referencia mostrada ao cliente e a mesma que vai para o log", () => {
  const log = collectLogs();
  const state = getSafeActionErrorState(postgresErrors[0], {
    fallbackMessage: "Nao foi possivel salvar este endereco.",
    logEvent: log.logEvent,
    prefix: "PED"
  });

  assert.equal(log.entries.length, 1);
  assert.equal(state.reference, log.entries[0].details.reference);
  assert.match(state.message, new RegExp(state.reference));
  assert.match(state.reference, /^PED-[0-9A-Z]{6}$/);
});

test("detalhe vai para o log sob chave que sobrevive ao redactSensitive", async () => {
  const log = collectLogs();

  getSafeActionErrorState(postgresErrors[0], {
    fallbackMessage: "x",
    logEvent: log.logEvent,
    prefix: "PED"
  });

  const chaves = Object.keys(log.entries[0].details);
  const { redactSensitive } = await import("../src/lib/logger.js");
  const redigido = redactSensitive(log.entries[0].details);

  assert.ok(chaves.includes("errorDetail"));
  assert.equal(redigido.errorDetail, postgresErrors[0].message);
  assert.equal(
    chaves.some((chave) => /message/i.test(chave)),
    false,
    "nenhuma chave pode casar com /message/i: o logger a censuraria"
  );
});

test("erro do Supabase Auth passa intacto para o cliente", () => {
  const authErrors = [
    Object.assign(new Error("Invalid login credentials"), {
      code: "invalid_credentials",
      status: 400
    }),
    Object.assign(new Error("User already registered"), {
      code: "user_already_exists",
      status: 422
    }),
    Object.assign(new Error("Email rate limit exceeded"), {
      code: "over_email_send_rate_limit",
      status: 429
    })
  ];

  for (const authError of authErrors) {
    const log = collectLogs();
    const state = getSafeActionErrorState(authError, {
      fallbackMessage: "Nao foi possivel entrar agora.",
      logEvent: log.logEvent,
      prefix: "AUT"
    });

    assert.equal(state.isInternal, false, `nao deveria mascarar: ${authError.message}`);
    assert.equal(state.message, authError.message);
    assert.equal(log.entries.length, 0);
  }
});

test("mensagem de validacao do proprio app passa intacta", () => {
  const state = getSafeActionErrorState(new Error("Informe o CEP."), {
    fallbackMessage: "x",
    logEvent() {},
    prefix: "PED"
  });

  assert.equal(state.isInternal, false);
  assert.equal(state.message, "Informe o CEP.");
});

test("erro marcado na origem e mascarado mesmo sem texto suspeito", () => {
  const marcado = createInternalActionError(new Error("falha opaca"), "salvar endereco");

  assert.equal(isInternalActionError(marcado), true);
});

test("nenhum boundary de cliente propaga error.message cru", async () => {
  const boundaries = [
    "app/pedido/actions.js",
    "app/conta/actions.js",
    "app/conta/page.js",
    "app/auth/actions.js",
    "app/auth/callback/route.js"
  ];

  for (const boundary of boundaries) {
    const conteudo = await source(boundary);
    // Ignora as linhas de log, onde o detalhe deve mesmo aparecer.
    const semLogs = conteudo
      .split(/\r?\n/)
      .filter((linha) => !/reason:|errorDetail:/.test(linha))
      .join("\n");

    assert.doesNotMatch(
      semLogs,
      /redirectWithError\([^)]*\b\w*[Ee]rror\.message/,
      `${boundary} manda erro cru para a URL`
    );
    assert.doesNotMatch(
      semLogs,
      /(?:return \{|error:)\s*\w*[Ee]rror\.message/,
      `${boundary} devolve erro cru no estado da action`
    );
    assert.doesNotMatch(
      semLogs,
      /^\s*\w+ = \w*[Ee]rror\.message;/m,
      `${boundary} atribui erro cru a variavel renderizada`
    );
  }
});

test("modulos de pedido/avaliacao propagam erro de banco pelo wrapper", async () => {
  const modulos = [
    "src/reviews/order-reviews.js",
    "src/reviews/order-claim.js",
    "src/reviews/review-photo-replacement.js"
  ];

  for (const modulo of modulos) {
    const conteudo = await source(modulo);

    assert.doesNotMatch(
      conteudo,
      /throw new Error\(\w*[Ee]rror\.message\)/,
      `${modulo} ainda propaga mensagem crua de driver`
    );
  }
});
