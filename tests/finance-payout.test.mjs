import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { resolveDisplayMarginCents, summarizeLedgers } from "../src/admin/finance-ledger.js";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

// ---------------------------------------------------------------------------
// O que o painel mostra
// ---------------------------------------------------------------------------

test("a margem exibida prefere a reconciliada e cai na provisoria", () => {
  assert.equal(
    resolveDisplayMarginCents({ provisional_margin_cents: 19500, reconciled_margin_cents: 16000 }),
    16000
  );
  assert.equal(
    resolveDisplayMarginCents({ provisional_margin_cents: 19500, reconciled_margin_cents: null }),
    19500
  );
});

// Prejuizo e o caso que o dono mais precisa ver. Um zero no lugar de -115,00
// esconderia exatamente a informacao que impede um repasse errado.
test("margem negativa aparece como negativa", () => {
  assert.equal(resolveDisplayMarginCents({ reconciled_margin_cents: -11500 }), -11500);

  const resumo = summarizeLedgers([
    { payout_status: "pendente", reconciled_margin_cents: -11500 },
    { payout_status: "pendente", reconciled_margin_cents: 16000 }
  ]);

  assert.equal(resumo.negativos, 1);
  assert.equal(resumo.pendenteTotalCents, 4500);
});

test("o total a repassar conta so o que esta pendente", () => {
  const resumo = summarizeLedgers([
    { payout_status: "pendente", provisional_margin_cents: 10000 },
    { payout_amount_cents: 7000, payout_status: "repassado", reconciled_margin_cents: 7000 },
    { payout_status: "estornado", reconciled_margin_cents: 0 },
    {
      payout_status: "pendente",
      reconciled_at: "2026-08-30T12:00:00Z",
      reconciled_margin_cents: 5000
    }
  ]);

  assert.equal(resumo.pendenteCount, 2);
  assert.equal(resumo.pendenteTotalCents, 15000);
  assert.equal(resumo.repassadoTotalCents, 7000);
  assert.equal(resumo.reconciliadosCount, 1);
});

// ---------------------------------------------------------------------------
// O sistema nao move dinheiro
// ---------------------------------------------------------------------------

// Decisao travada do dono: o sistema calcula e registra, uma PESSOA transfere.
// Este teste existe para que ninguem "complete" o fluxo com uma API de
// transferencia sem essa conversa acontecer de novo.
test("o financeiro nao fala com nenhuma API de transferencia", async () => {
  const codigo = await source("src/admin/finance-admin.js");
  const semComentarios = codigo.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/[^\n]*$/gm, "");

  // Zero chamada de rede: o modulo so escreve no proprio banco.
  assert.equal(semComentarios.includes("fetch("), false);
  assert.equal(/https?:\/\//.test(semComentarios), false);

  // "transferencia" aparece nas mensagens em portugues, entao a busca e por
  // nome de operacao, nao por substring solta.
  for (const proibido of [
    "createTransfer",
    "/transfers",
    "bank_transfer",
    "money_transfer",
    "withdraw",
    "payout_request",
    "pix_out"
  ]) {
    assert.equal(
      semComentarios.includes(proibido),
      false,
      `o financeiro nao pode conhecer ${proibido}`
    );
  }
});

// ---------------------------------------------------------------------------
// Repasse exige aprovacao humana
// ---------------------------------------------------------------------------

// O CHECK do banco ja recusa repasse sem data, valor e aprovador. A validacao
// aqui existe para a mensagem ser legivel em vez de um erro de constraint.
test("registrar repasse exige aprovador, referencia, data e valor", async () => {
  const codigo = await source("src/admin/finance-admin.js");
  const bloco = codigo.slice(codigo.indexOf('payoutStatus === "repassado"'));

  assert.match(bloco, /Informe quem aprovou o repasse/);
  assert.match(bloco, /Informe a referencia da transferencia/);
  assert.match(bloco, /Informe a data em que a transferencia foi feita/);
  assert.match(bloco, /Informe o valor transferido/);
});

test("o CHECK do banco cobre o mesmo que a action valida", async () => {
  const sql = await source("supabase/migrations/20260825120000_payment_ledger_and_webhooks.sql");

  assert.match(
    sql,
    /payout_status <> 'repassado'\s*\n\s*or \(payout_at is not null and payout_approved_by is not null and payout_amount_cents is not null\)/
  );
});

// Voltar para pendente sem limpar os campos deixaria um comprovante orfao
// apontando para uma transferencia que o painel diz nao ter acontecido.
test("desfazer o repasse limpa o comprovante", async () => {
  const codigo = await source("src/admin/finance-admin.js");
  const bloco = codigo.slice(
    codigo.indexOf("} else {"),
    codigo.indexOf("const { error: updateError }")
  );

  for (const campo of [
    "payout_amount_cents",
    "payout_approved_by",
    "payout_at",
    "payout_reference"
  ]) {
    assert.match(bloco, new RegExp(`${campo} = null`), `${campo} deveria ser limpo`);
  }
});

test("o repasse e auditado com quem aprovou e o status anterior", async () => {
  const codigo = await source("src/admin/finance-admin.js");

  assert.match(codigo, /action: "ledger_repasse_registrado"/);
  assert.match(codigo, /statusAnterior: ledger\.payout_status/);
  assert.match(codigo, /aprovadoPor: patch\.payout_approved_by/);
});

// ---------------------------------------------------------------------------
// Vazamento
// ---------------------------------------------------------------------------

// Taxa, custo e margem sao dados internos. A pagina financeira e a UNICA da
// vitrine que pode mostra-los, e ela exige sessao admin.
test("a pagina financeira exige sessao admin", async () => {
  const pagina = await source("app/admin/financeiro/page.js");

  assert.match(pagina, /isAdminTokenConfigured\(\)/);
  assert.match(pagina, /await isAdminSessionValid\(\)/);
  assert.match(pagina, /redirect\("\/entrar\?next=\/admin"\)/);
});

test("as actions do financeiro checam sessao e origem", async () => {
  const actions = await source("app/admin/actions.js");

  for (const nome of ["markLedgerPayoutAction", "reconcileLedgerAction"]) {
    const bloco = actions.slice(actions.indexOf(`export async function ${nome}`));
    const corpo = bloco.slice(0, bloco.indexOf("\n}\n") + 1);

    assert.match(corpo, /await isAdminSessionValid\(\)/, `${nome} deveria checar a sessao`);
    assert.match(corpo, /await isSameOriginAdminRequest\(\)/, `${nome} deveria checar a origem`);
  }
});
