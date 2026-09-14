import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

function semComentarios(codigo) {
  return codigo.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/[^\n]*$/gm, "");
}

// ---------------------------------------------------------------------------
// Cobranca aceita nunca vira erro na tela
// ---------------------------------------------------------------------------

// Depois que o provedor aceita, o dinheiro saiu. Se a escrituracao virar 500, o
// cliente tenta de novo e paga duas vezes — por isso `finalizeCharge` nao lanca.
test("a escrituracao nao lanca depois da cobranca aceita", async () => {
  const codigo = await source("src/payments/charge-flow.js");
  const bloco = codigo.slice(codigo.indexOf("export async function finalizeCharge"));

  // Duas redes de protecao: a gravacao e os efeitos da confirmacao.
  assert.equal((bloco.match(/catch \(error\)/g) ?? []).length, 2);
  assert.equal(bloco.includes("throw"), false, "finalizeCharge nao pode lancar");
  assert.match(bloco, /return \{ escriturada: false \}/);
});

// A cobranca existe no provedor e nao existe aqui: e a unica falha do fluxo que
// perde dinheiro em silencio. Precisa sair no log com o id do provedor, que e o
// que permite achar o pagamento no painel.
test("a cobranca orfa e registrada com o id do provedor", async () => {
  const codigo = await source("src/payments/charge-flow.js");

  assert.match(codigo, /"payment_charge_orfa"/);
  assert.match(codigo, /providerPaymentId: charge\.providerPaymentId/);
  assert.match(codigo, /stage: "payment-persist"/);
});

test("as tres rotas de cobranca usam a escrituracao segura", async () => {
  for (const metodo of ["pix", "cartao", "boleto"]) {
    const rota = await source(`app/api/pagamento/${metodo}/route.js`);

    assert.match(rota, /finalizeCharge\(\{/, `${metodo} deveria usar finalizeCharge`);
    assert.equal(
      semComentarios(rota).includes("persistProviderCharge("),
      false,
      `${metodo} nao deveria gravar direto: a falha viraria erro na tela`
    );
  }
});

// ---------------------------------------------------------------------------
// Chave de habilitacao por ambiente
// ---------------------------------------------------------------------------

test("o runbook e o .env.example citam as duas chaves", async () => {
  const runbook = await source("docs/ROLLOUT-PAGAMENTO.md");
  const exemplo = await source(".env.example");

  for (const chave of ["PAYMENTS_ONLINE_ENABLED", "PAYMENTS_PREVIEW_ONLINE_ENABLED"]) {
    assert.ok(runbook.includes(chave), `runbook deveria citar ${chave}`);
    assert.ok(exemplo.includes(chave), `.env.example deveria citar ${chave}`);
  }
});

// Desligar tem que ser uma variavel, nao um deploy: em incidente, esperar build
// e o que transforma um susto em prejuizo.
test("o runbook documenta o rollback sem deploy", async () => {
  const runbook = await source("docs/ROLLOUT-PAGAMENTO.md");
  const bloco = runbook.slice(runbook.indexOf("## 6. Rollback"));

  assert.match(bloco, /wrangler secret put PAYMENTS_ONLINE_ENABLED/);
  assert.match(bloco, /Nao desfaca as\s*\n?migracoes|Não desfaça as\s*\n?migrações/);
});

// Banco antes do codigo: o projeto ja teve tres incidentes por migracao
// faltando, e o runbook e onde essa ordem fica escrita.
test("o runbook poe as migracoes antes do deploy", async () => {
  const runbook = await source("docs/ROLLOUT-PAGAMENTO.md");

  assert.ok(
    runbook.indexOf("## 1. Migrações") < runbook.indexOf("## 2. Deploy"),
    "as migracoes tem que vir antes do deploy no documento"
  );

  for (const migracao of [
    "20260825120000_payment_ledger_and_webhooks.sql",
    "20260901120000_supplier_automation.sql"
  ]) {
    assert.ok(runbook.includes(migracao), `runbook deveria nomear ${migracao}`);
  }
});

// A pagina chama notFound(), mas nesta versao do Next isso responde 200 com o
// corpo de 404 — o cabecalho ja saiu quando o componente decide. O guard no
// middleware decide ANTES do primeiro byte, entao o status sai certo e o
// monitoramento consegue ver que o rollback pegou.
test("o middleware devolve 404 de verdade com o pagamento desligado", async () => {
  const middleware = await source("middleware.js");

  assert.match(
    middleware,
    /isPaymentPath\(request\.nextUrl\.pathname\) && !isOnlinePaymentEnabled\(\)/
  );
  assert.match(middleware, /status: 404/);
  assert.match(middleware, /pathname\.startsWith\("\/pedido\/pagamento\/"\)/);
});

// O guard so serve se a rota passar pelo middleware.
test("a rota de pagamento esta no matcher do middleware", async () => {
  const middleware = await source("middleware.js");
  const matcher = middleware.slice(middleware.indexOf("export const config"));

  assert.match(matcher, /"\/pedido\/:path\*"/);
});

// ---------------------------------------------------------------------------
// Observabilidade
// ---------------------------------------------------------------------------

// Cada evento da tabela do runbook precisa existir no codigo: uma tabela que
// lista evento inexistente e pior do que tabela nenhuma na hora do incidente.
test("todo evento do runbook existe no codigo", async () => {
  const runbook = await source("docs/ROLLOUT-PAGAMENTO.md");
  const codigo = (
    await Promise.all(
      [
        "src/payments/charge-flow.js",
        "src/payments/supplier-automation.js",
        "src/payments/ledger-reconciliation.js",
        "src/admin/order-operation.js",
        "app/api/pagamento/webhook/route.js",
        "app/api/pagamento/boleto/route.js",
        "app/api/pagamento/pix/route.js"
      ].map(source)
    )
  ).join("\n");

  // So a tabela de observabilidade: fora dela o runbook cita nome de TABELA
  // (payment_webhook_events, order_ledger), que nao e evento de log.
  const tabela = runbook.slice(
    runbook.indexOf("## 7. O que observar"),
    runbook.indexOf("## 8. O que este rollout")
  );
  const eventos = [...tabela.matchAll(/`(payment_[a-z_]+|automacao_[a-z_]+|ledger_[a-z_]+)`/g)].map(
    (match) => match[1]
  );

  assert.ok(eventos.length >= 6, `poucos eventos documentados: ${eventos.length}`);

  for (const evento of new Set(eventos)) {
    assert.ok(codigo.includes(`"${evento}"`), `runbook cita ${evento}, que nao existe no codigo`);
  }
});

test("as falhas silenciosas da automacao e do ledger passaram a ser registradas", async () => {
  const automacao = await source("src/payments/supplier-automation.js");
  const ledger = await source("src/payments/ledger-reconciliation.js");

  assert.match(automacao, /"automacao_fornecedor_pedido_nao_encontrado"/);
  assert.match(automacao, /"automacao_fornecedor_falhou"/);
  assert.match(ledger, /"ledger_leitura_falhou"/);
});
