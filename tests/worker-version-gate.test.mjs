import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { avaliarPortaoDeVersao } from "../scripts/worker-version-gate.mjs";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

function semComentarios(codigo) {
  return codigo.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/[^\n]*$/gm, "");
}

function versao(id, criadaEm) {
  return { id, metadata: { created_on: criadaEm, source: "wrangler" } };
}

function publicada(...ids) {
  return {
    versions: ids.map((id) => ({ percentage: 100 / ids.length, version_id: id }))
  };
}

// O estado real do Worker de producao quando o envio falhou em 2026-09-10: duas
// versoes de branch enviadas DEPOIS da que serve, nunca publicadas.
const ESTADO_REAL = [
  versao("15eeda22", "2026-09-02T16:29:22Z"),
  versao("fbd442ae", "2026-09-02T16:40:55Z"),
  versao("af260e5d", "2026-09-02T16:43:53Z"),
  versao("b08ee3e6", "2026-09-02T16:46:29Z")
];

test("bloqueia quando ha versao nao publicada na frente da que serve", () => {
  const portao = avaliarPortaoDeVersao({
    deployment: publicada("fbd442ae"),
    versoes: ESTADO_REAL
  });

  assert.equal(portao.liberado, false);
  assert.equal(portao.motivo, "versao_nao_publicada_na_frente");
  assert.deepEqual(
    portao.naoPublicadas.map((item) => item.id),
    ["af260e5d", "b08ee3e6"]
  );
  assert.deepEqual(
    portao.servindo.map((item) => item.id),
    ["fbd442ae"]
  );
});

test("libera quando a mais nova e a que serve", () => {
  const portao = avaliarPortaoDeVersao({
    deployment: publicada("b08ee3e6"),
    versoes: ESTADO_REAL
  });

  assert.equal(portao.liberado, true);
  assert.deepEqual(portao.naoPublicadas, []);
});

// Versao velha nunca publicada nao impede nada: a Cloudflare olha a mais nova.
test("versao nao publicada ATRAS da que serve nao bloqueia", () => {
  const portao = avaliarPortaoDeVersao({
    deployment: publicada("fbd442ae"),
    versoes: ESTADO_REAL.slice(0, 2)
  });

  assert.equal(portao.liberado, true);
});

test("a ordem da lista devolvida nao muda o veredito", () => {
  const embaralhada = [ESTADO_REAL[3], ESTADO_REAL[0], ESTADO_REAL[2], ESTADO_REAL[1]];
  const portao = avaliarPortaoDeVersao({
    deployment: publicada("fbd442ae"),
    versoes: embaralhada
  });

  assert.equal(portao.liberado, false);
  assert.deepEqual(
    portao.naoPublicadas.map((item) => item.id),
    ["af260e5d", "b08ee3e6"]
  );
});

// Publicacao gradual: duas versoes no ar ao mesmo tempo. Vale a mais nova delas.
test("publicacao gradual libera se a mais nova esta entre as publicadas", () => {
  const portao = avaliarPortaoDeVersao({
    deployment: publicada("fbd442ae", "b08ee3e6"),
    versoes: ESTADO_REAL
  });

  assert.equal(portao.liberado, true);
});

test("sem resposta do wrangler nao libera", () => {
  for (const entrada of [
    { deployment: null, versoes: ESTADO_REAL },
    { deployment: publicada("fbd442ae"), versoes: null },
    { deployment: { versions: [] }, versoes: [] }
  ]) {
    const portao = avaliarPortaoDeVersao(entrada);

    assert.equal(portao.liberado, false);
    assert.equal(portao.motivo, "sem_dados");
  }
});

// A lista e paginada. Se a versao no ar nao veio nela, houve envios demais
// depois — e nao da para dizer que a mais nova esta publicada.
test("versao publicada fora da lista devolvida nao libera", () => {
  const portao = avaliarPortaoDeVersao({
    deployment: publicada("00000000"),
    versoes: ESTADO_REAL
  });

  assert.equal(portao.liberado, false);
  assert.equal(portao.motivo, "versao_servindo_fora_da_lista");
});

test("o configurador aborta pelo portao antes do primeiro envio", async () => {
  const codigo = semComentarios(await source("scripts/configurar-worker-producao.mjs"));
  const aborta = codigo.indexOf("if (!portao.liberado)");
  const envia = codigo.indexOf('"secret", "put"');

  assert.ok(aborta > 0, "abort pelo portao nao encontrado");
  assert.ok(envia > 0, "envio de segredo nao encontrado");
  assert.ok(aborta < envia, "o portao precisa vir antes do primeiro secret put");
});

// `versions secret put` cria a versao nova a partir da mais recente — a nao
// publicada, codigo de branch. Publicar isso e o que o portao existe para evitar.
test("o configurador nunca usa versions secret put", async () => {
  const codigo = semComentarios(await source("scripts/configurar-worker-producao.mjs"));

  assert.doesNotMatch(codigo, /"versions",\s*"secret"/);
});
