import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

function semComentarios(codigo) {
  return codigo.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/[^\n]*$/gm, "");
}

// A Public Key e lida no servidor, em tempo de execucao, por
// getPaymentPublicKey(). O configurador de producao chegou a deixa-la de fora
// achando que ela ia no build: a loja subiria com a aba de cartao sem SDK, e so
// Pix e boleto cobrariam. Descoberto em 2026-09-14, antes da primeira cobranca
// real, conferindo os bindings da versao no ar.
test("o configurador de producao envia a chave publica do cartao", async () => {
  const codigo = semComentarios(await source("scripts/configurar-worker-producao.mjs"));
  const lista = codigo.slice(codigo.indexOf("const VARIAVEIS"), codigo.indexOf("const PROIBIDAS"));

  assert.match(lista, /nome: "NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY"/);
  assert.doesNotMatch(codigo, /SOMENTE_NO_BUILD/, "a nota de variavel so de build era falsa");
});

// O motivo de a chave precisar estar no Worker: a leitura e dinamica, entao o
// build nao inlina nada. Se um dia virar leitura inlinada, este teste avisa que
// a premissa do configurador mudou.
test("a pagina de pagamento le a chave publica em tempo de execucao", async () => {
  const leitura = await source("src/lib/runtime-target.js");
  const pagina = await source("app/pedido/pagamento/[orderId]/page.js");

  assert.match(leitura, /process\.env\[key\]/);
  assert.match(pagina, /publicKey=\{getPaymentPublicKey\(\)\}/);
});

test("chave publica de sandbox bloqueia o envio para producao", async () => {
  const codigo = semComentarios(await source("scripts/configurar-worker-producao.mjs"));
  const bloqueio = codigo.indexOf('chavePublicaProducao.startsWith("TEST-")');
  const aborta = codigo.indexOf("if (bloqueios.length)");

  assert.ok(bloqueio > 0, "bloqueio da chave de sandbox nao encontrado");
  assert.ok(bloqueio < aborta, "o bloqueio precisa vir antes do abort");
});

// O staging ja mandava a equivalente de sandbox: os dois scripts precisam
// concordar sobre onde a chave publica vive.
test("staging tambem envia a chave publica do proprio ambiente", async () => {
  const preview = await source("scripts/configurar-worker-preview.mjs");

  assert.match(preview, /nome: "NEXT_PUBLIC_MERCADOPAGO_SANDBOX_PUBLIC_KEY"/);
});
