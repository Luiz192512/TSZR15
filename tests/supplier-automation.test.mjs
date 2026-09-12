import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildAutomationKey } from "../src/payments/supplier-automation.js";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

// ---------------------------------------------------------------------------
// A automacao NAO compra no fornecedor
// ---------------------------------------------------------------------------

// Decisao travada do dono da loja: automatizar so o fluxo interno. A compra em
// Shopee/AliExpress continua sendo um ato humano. Este teste existe para que
// ninguem "complete" a automacao depois sem essa conversa acontecer de novo.
test("a automacao nao fala com nenhum fornecedor", async () => {
  const codigo = await source("src/payments/supplier-automation.js");
  const semComentarios = codigo.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/[^\n]*$/gm, "");

  for (const proibido of ["shopee", "aliexpress", "puppeteer", "playwright"]) {
    assert.equal(
      semComentarios.toLowerCase().includes(proibido),
      false,
      `automacao nao pode conhecer ${proibido}`
    );
  }

  // Nenhuma chamada de rede: a automacao so escreve no proprio banco.
  assert.equal(semComentarios.includes("fetch("), false);
});

// ---------------------------------------------------------------------------
// Idempotencia
// ---------------------------------------------------------------------------

// Webhook reenviado, evento fora de ordem e duas requisicoes simultaneas
// produzem a MESMA chave — e a UNIQUE parcial no banco recusa a segunda.
test("a chave de idempotencia depende so do pedido", () => {
  const pedido = "11111111-1111-1111-1111-111111111111";

  assert.equal(buildAutomationKey(pedido), buildAutomationKey(pedido));
  assert.notEqual(buildAutomationKey(pedido), buildAutomationKey("outro"));
  assert.match(buildAutomationKey(pedido), new RegExp(pedido));
});

test("a chave usa o indice unico criado na migracao", async () => {
  const sql = await source("supabase/migrations/20260825120000_payment_ledger_and_webhooks.sql");

  assert.match(
    sql,
    /create unique index if not exists supplier_purchases_automation_key_idx[\s\S]*?where automation_key is not null/
  );
});

test("violacao de unicidade e tratada como ja executada, nao como erro", async () => {
  const codigo = await source("src/payments/supplier-automation.js");

  assert.match(codigo, /UNIQUE_VIOLATION = "23505"/);
  assert.match(codigo, /compraError\?\.code === UNIQUE_VIOLATION/);
  assert.match(codigo, /motivo: "ja_executada", ok: true/);
});

// ---------------------------------------------------------------------------
// Desfazer
// ---------------------------------------------------------------------------

// Apagar uma compra que o operador ja fez destruiria o registro de um gasto
// real. Nesse caso a linha fica, marcada como problema.
test("desfazer so remove compra intocada pelo operador", async () => {
  const codigo = await source("src/payments/supplier-automation.js");

  assert.match(codigo, /created_by === "automacao" && compra\.source_status === "nao_comprado"/);
  assert.match(codigo, /source_status: "problema"/);
  assert.match(codigo, /Compra já iniciada/);
});

test("o estorno do ledger sinaliza repasse ja executado", async () => {
  const codigo = await source("src/payments/supplier-automation.js");

  assert.match(codigo, /payout_status: "estornado"/);
  assert.match(codigo, /repasse ja executado, exige devolucao/i);
});

// `recusado` e `expirado` ficam de fora: neles a automacao nunca rodou.
test("so estados de dinheiro-de-volta disparam o desfazer", async () => {
  const rota = await source("app/api/pagamento/webhook/route.js");
  const linha = rota.match(/const REVERSOES = new Set\(\[([^\]]*)\]\)/)?.[1] ?? "";

  for (const estado of ["reembolsado", "estornado", "cancelado"]) {
    assert.match(linha, new RegExp(`"${estado}"`), `${estado} deveria desfazer`);
  }

  for (const estado of ["recusado", "expirado", "autorizado"]) {
    assert.equal(linha.includes(`"${estado}"`), false, `${estado} nao deveria desfazer`);
  }
});

// ---------------------------------------------------------------------------
// Gatilho e efeitos
// ---------------------------------------------------------------------------

test("a automacao dispara so na confirmacao do pagamento", async () => {
  const rota = await source("app/api/pagamento/webhook/route.js");
  const bloco = rota.slice(
    rota.indexOf('providerPayment.status === "pagamento_confirmado"'),
    rota.indexOf("REVERSOES.has")
  );

  assert.match(bloco, /applyConfirmedPaymentEffects/);

  const efeitos = await source("src/payments/confirmed-payment.js");
  assert.match(efeitos, /runSupplierAutomation/);
  assert.match(efeitos, /upsertProvisionalLedger/);
});

// Cartao aprovado na hora nao gera evento de MUDANCA: a rota de cobranca ja
// gravou o status final, e o webhook seguinte ve "status inalterado". Sem os
// dois caminhos passando pelo mesmo ponto, esse pedido ficava sem ledger e sem
// compra interna — foi o que uma cobranca real de sandbox revelou.
test("cartao aprovado na hora tambem dispara os efeitos", async () => {
  const rota = await source("app/api/pagamento/cartao/route.js");
  const escrituracao = await source("src/payments/charge-flow.js");

  assert.match(rota, /finalizeCharge\(\{/);

  const bloco = escrituracao.slice(
    escrituracao.indexOf('charge.status !== "pagamento_confirmado"')
  );
  assert.match(bloco, /applyConfirmedPaymentEffects/);
});

test("o webhook conserta o pedido quando o status ja estava confirmado", async () => {
  const rota = await source("app/api/pagamento/webhook/route.js");
  const bloco = rota.slice(
    rota.indexOf('result.reason === "status_inalterado"'),
    rota.indexOf("if (!result.applied) {")
  );

  assert.match(bloco, /applyConfirmedPaymentEffects/);
});

// O pedido tambem tem que sair de "aguardando pagamento" — o painel e o
// rastreio publico leem esse campo, nao o da tabela de pagamentos.
test("os efeitos marcam o pedido como pago", async () => {
  const efeitos = await source("src/payments/confirmed-payment.js");

  assert.match(efeitos, /from\("orders"\)[\s\S]*?payment_status: STATUS_CONFIRMADO/);
});

test("a automacao registra rastreio e auditoria", async () => {
  const codigo = await source("src/payments/supplier-automation.js");

  assert.match(codigo, /from\("supplier_tracking_events"\)/);
  assert.match(codigo, /action: "automacao_compra_interna_criada"/);
  assert.match(codigo, /action: "automacao_compra_interna_desfeita"/);
});

// O operador pode ter movido o pedido adiante antes de o webhook chegar. A
// automacao nao pode puxar o status de volta.
test("o status so avanca, nunca retrocede", async () => {
  const codigo = await source("src/payments/supplier-automation.js");

  assert.match(codigo, /\.in\("operational_status", STATUS_ANTES_DA_COMPRA\)/);
});

// Pedido pago pelo site nasce em `enviado_whatsapp_business` e nunca passa por
// `pagamento_confirmado` no campo OPERACIONAL. Exigir esse valor deixava o
// status parado depois de uma cobranca real de cartao.
test("os estados anteriores a compra saem da propria linha do tempo", async () => {
  const { operationalStatuses } = await import("../src/orders/status.js");
  const linha = operationalStatuses.map((status) => status.id);
  const antes = linha.slice(0, linha.indexOf("compra_interna_pendente"));

  for (const status of [
    "enviado_whatsapp_business",
    "aguardando_pagamento",
    "pagamento_confirmado"
  ]) {
    assert.ok(antes.includes(status), `${status} deveria permitir avancar`);
  }

  for (const status of [
    "compra_interna_realizada",
    "em_transito",
    "entregue",
    "cancelado",
    "problema_envio"
  ]) {
    assert.equal(antes.includes(status), false, `${status} nao pode ser puxado de volta`);
  }
});

// Perder o aviso e um incomodo; desfazer o pagamento por causa dele seria um
// estrago. O e-mail falha em silencio registrado.
test("falha de e-mail nao derruba a automacao", async () => {
  const codigo = await source("src/payments/supplier-automation-email.js");

  assert.match(codigo, /catch \(error\)/);
  assert.match(codigo, /automacao_email_operador_falhou/);
  assert.match(codigo, /return \{ motivo: "falha-no-envio", enviado: false \}/);
});

// ---------------------------------------------------------------------------
// Vazamento
// ---------------------------------------------------------------------------

test("o rastreio publico nao expoe fornecedor, custo nem origem da linha", async () => {
  const codigo = await source("src/tracking/order-tracking.js");
  const select = codigo.match(/from\("supplier_purchases"\)\s*\.select\("([^"]*)"\)/)?.[1] ?? "";

  assert.ok(select, "select de supplier_purchases nao encontrado");

  for (const proibido of [
    "source_store_name",
    "source_product_url",
    "product_cost_cents",
    "shipping_cost_cents",
    "internal_channel",
    "internal_notes",
    "created_by",
    "automation_key"
  ]) {
    assert.equal(select.includes(proibido), false, `rastreio publico expoe ${proibido}`);
  }
});

test("o painel admin distingue o que foi automatico do que foi manual", async () => {
  const painel = await source("app/admin/_components/admin-orders-view.js");

  assert.match(painel, /created_by === "automacao"/);
  assert.match(painel, /criada pela automação/);
  assert.match(painel, /precisa ser feita por uma pessoa/);
});
