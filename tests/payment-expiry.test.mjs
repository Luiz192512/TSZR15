import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  isStalePixCharge,
  PIX_EXPIRY_GRACE_MS,
  resolveEffectivePaymentStatus
} from "../src/payments/payment-expiry.js";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

function semComentarios(codigo) {
  return codigo.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/[^\n]*$/gm, "");
}

function semComentariosSql(codigo) {
  return codigo.replace(/^\s*--[^\n]*$/gm, "");
}

const MIGRACAO = "supabase/migrations/20260910120000_expire_stale_pix_payments.sql";

// Um dos dois Pix do sandbox que venceram sem aviso do provedor.
const VENCE = "2026-09-09T17:49:03Z";
const DEPOIS_DA_FOLGA = Date.parse(VENCE) + PIX_EXPIRY_GRACE_MS + 1000;
const DENTRO_DA_FOLGA = Date.parse(VENCE) + PIX_EXPIRY_GRACE_MS - 1000;

function pix(extra = {}) {
  return {
    expires_at: VENCE,
    payment_method_id: "pix",
    status: "aguardando_pagamento",
    ...extra
  };
}

// ---------------------------------------------------------------------------
// A regra
// ---------------------------------------------------------------------------

test("Pix vencido ha mais que a folga aparece como expirado", () => {
  assert.equal(isStalePixCharge(pix(), DEPOIS_DA_FOLGA), true);
  assert.equal(resolveEffectivePaymentStatus(pix(), DEPOIS_DA_FOLGA), "expirado");
});

// O Pix pago no ultimo minuto chega por webhook segundos depois. Declarar
// expirado antes disso para a consulta da tela — e o cliente que pagou nunca ve
// a confirmacao.
test("dentro da folga o Pix continua aguardando", () => {
  assert.equal(resolveEffectivePaymentStatus(pix(), DENTRO_DA_FOLGA), "aguardando_pagamento");
});

// Quem paga boleto no ultimo dia compensa de um a tres dias uteis depois.
test("boleto vencido nao expira", () => {
  assert.equal(
    resolveEffectivePaymentStatus(pix({ payment_method_id: "boleto" }), DEPOIS_DA_FOLGA),
    "aguardando_pagamento"
  );
});

test("pagamento manual, sem validade, nunca expira", () => {
  for (const semValidade of [null, undefined, "", "nao-e-data"]) {
    assert.equal(
      resolveEffectivePaymentStatus(pix({ expires_at: semValidade }), DEPOIS_DA_FOLGA),
      "aguardando_pagamento",
      `expires_at=${semValidade} nao pode inventar vencimento`
    );
  }
});

test("so aguardando vira expirado", () => {
  for (const status of ["pagamento_confirmado", "recusado", "cancelado", "em_analise"]) {
    assert.equal(resolveEffectivePaymentStatus(pix({ status }), DEPOIS_DA_FOLGA), status);
  }
});

// ---------------------------------------------------------------------------
// As duas implementacoes concordam
// ---------------------------------------------------------------------------

test("a migracao usa a mesma regra e a mesma folga", async () => {
  const sql = semComentariosSql(await source(MIGRACAO));

  assert.equal(PIX_EXPIRY_GRACE_MS, 10 * 60 * 1000, "a folga do JS mudou sem a do SQL");
  assert.match(sql, /expires_at < now\(\) - interval '10 minutes'/);
  assert.match(sql, /status = 'aguardando_pagamento'/);
  assert.match(sql, /payment_method_id = 'pix'/);
  assert.match(sql, /provider = 'mercadopago'/);
  assert.match(sql, /expires_at is not null/);
  assert.doesNotMatch(sql, /boleto/, "boleto nao pode entrar na expiracao");
});

// O pedido que ja andou (pago, em analise, cancelado) nao pode ser rebaixado
// por uma cobranca antiga vencida.
test("a migracao so move o pedido que ainda estava aguardando", async () => {
  const sql = semComentariosSql(await source(MIGRACAO));

  assert.match(sql, /pedido\.payment_status = 'aguardando_pagamento'/);
});

test("a funcao de expiracao nao fica exposta pela API publica", async () => {
  const sql = semComentariosSql(await source(MIGRACAO));

  assert.match(
    sql,
    /revoke all on function public\.expire_stale_pix_payments\(\) from public, anon, authenticated/
  );
});

// Com nome, da para desligar sem caçar o id do job.
test("o agendamento tem nome e intervalo de 10 minutos", async () => {
  const sql = semComentariosSql(await source(MIGRACAO));

  assert.match(sql, /cron\.schedule\(\s*'expirar-pix-vencido',\s*'\*\/10 \* \* \* \*'/);
});

// ---------------------------------------------------------------------------
// Onde a regra e aplicada
// ---------------------------------------------------------------------------

// A rota de status so le (outro teste garante). O vencimento entra ali como
// leitura, nao como escrita.
test("a rota de status responde o estado efetivo", async () => {
  const rota = semComentarios(await source("app/api/pagamento/status/route.js"));

  assert.match(rota, /status: resolveEffectivePaymentStatus\(payment\)/);

  const select = rota.match(/from\("payments"\)\s*\.select\(\s*"([^"]*)"/)?.[1] ?? "";

  for (const coluna of ["status", "payment_method_id", "expires_at"]) {
    assert.ok(select.includes(coluna), `sem ${coluna} a rota nao tem como avaliar o vencimento`);
  }
});

// Sem isto, um Pix gerado de novo depois de um vencido deixava o pagamento
// "aguardando" e o pedido "expirado": o operador via venda morta enquanto o
// cliente pagava.
test("cobranca em aberto reabre o status do pedido", async () => {
  const fluxo = semComentarios(await source("src/payments/charge-flow.js"));

  assert.match(fluxo, /STATUS_ABERTOS\.has\(charge\.status\)/);

  const helper = fluxo.slice(fluxo.indexOf("async function reabrirStatusDoPedido"));

  assert.match(helper, /from\("orders"\)/);
  assert.match(helper, /\.neq\("payment_status", "pagamento_confirmado"\)/);
});

// Cartao recusado nao reabre nada: sobrescrever o pedido com ele esconderia um
// Pix que continua valendo.
test("recusado nao entra nos estados que reabrem o pedido", async () => {
  const fluxo = semComentarios(await source("src/payments/charge-flow.js"));
  const conjunto = fluxo.match(/STATUS_ABERTOS = new Set\(\[([^\]]*)\]\)/)?.[1] ?? "";

  assert.ok(conjunto, "STATUS_ABERTOS nao encontrado");
  assert.equal(conjunto.includes("recusado"), false);
  assert.match(conjunto, /"aguardando_pagamento"/);
});

// ---------------------------------------------------------------------------
// O CHECK do pedido
// ---------------------------------------------------------------------------

// `orders.payment_status` aceitava 4 estados e `payments.status`, 10. Toda
// escrita de um dos 6 de fora no pedido era recusada pelo banco em silencio — o
// webhook nao confere o erro dessa escrita — e o proprio `expirado` desta
// migracao seria recusado.
test("o pedido aceita exatamente os estados que a tela e o admin conhecem", async () => {
  const { paymentStatuses } = await import("../src/orders/status.js");
  const sql = semComentariosSql(await source(MIGRACAO));
  const lista =
    sql.match(/orders_payment_status_check check \(\s*payment_status in \(([^)]*)\)/i)?.[1] ?? "";
  const aceitos = [...lista.matchAll(/'([a-z_]+)'/g)].map((match) => match[1]).sort();

  assert.deepEqual(aceitos, paymentStatuses.map((status) => status.id).sort());
});

// Na mesma transacao a ordem importa: com a funcao criada e o CHECK ainda
// estreito, a primeira rodada do agendamento falharia.
test("o CHECK e alargado antes da funcao que grava expirado no pedido", async () => {
  const sql = semComentariosSql(await source(MIGRACAO));

  assert.ok(
    sql.indexOf("add constraint orders_payment_status_check") <
      sql.indexOf("create or replace function public.expire_stale_pix_payments"),
    "o CHECK precisa vir antes da funcao"
  );
});
