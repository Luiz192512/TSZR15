import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { toPublicCatalogProduct } from "../src/catalog/index.js";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

function semComentarios(codigo) {
  return codigo.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/[^\n]*$/gm, "");
}

// Recorta o objeto literal gravado em `internal_purchase_source`, contando
// chaves ate fechar. Ler o arquivo inteiro daria falso positivo em qualquer
// mencao a custo em outro ponto do modulo.
function objetoGravadoNaColunaPublica(codigo) {
  const inicio = codigo.indexOf("internal_purchase_source: {");

  assert.ok(inicio > 0, "gravacao de internal_purchase_source nao encontrada");

  let profundidade = 0;

  for (let i = codigo.indexOf("{", inicio); i < codigo.length; i += 1) {
    if (codigo[i] === "{") profundidade += 1;
    if (codigo[i] === "}") {
      profundidade -= 1;
      if (profundidade === 0) return codigo.slice(inicio, i + 1);
    }
  }

  throw new Error("objeto de internal_purchase_source nao fecha");
}

// `catalog_products` libera `select` para `anon` DE PROPOSITO, e o PostgREST nao
// filtra por coluna: tudo que estiver na linha sai para quem tem a chave
// publicavel. Um lote antigo gravou `marginCents` ali e a margem de 6 produtos
// ficou publica. O nome da coluna e o `visibility: "internal-only"` dentro dela
// sugerem protecao que nao existe — por isso a regra precisa de teste, e nao de
// convencao.
const PALAVRAS_DE_DINHEIRO = /margin|profit|cost|custo|lucro|fee|payout|shipping|price|preco/i;

test("o painel nao grava valor em dinheiro na coluna que o publico le", async () => {
  const objeto = objetoGravadoNaColunaPublica(semComentarios(await source("src/admin/catalog-admin.js")));
  const chaves = [...objeto.matchAll(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:/gm)]
    .map((match) => match[1])
    .filter((chave) => chave !== "internal_purchase_source");

  const suspeitas = chaves.filter((chave) => PALAVRAS_DE_DINHEIRO.test(chave));

  assert.deepEqual(
    suspeitas,
    [],
    `estas chaves ficariam publicas: ${suspeitas.join(", ")}. Custo e margem moram em catalog_product_costs`
  );
});

// A lista fechada e o que faz a regra acima valer para o campo que ainda nao
// foi inventado: chave nova entra aqui de proposito, com alguem olhando.
test("as chaves gravadas continuam sendo as quatro conhecidas", async () => {
  const objeto = objetoGravadoNaColunaPublica(semComentarios(await source("src/admin/catalog-admin.js")));
  const chaves = [...objeto.matchAll(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:/gm)]
    .map((match) => match[1])
    .filter((chave) => chave !== "internal_purchase_source")
    .sort();

  assert.deepEqual(chaves, ["importMode", "provider", "sourceCategoryIds", "visibility"]);
});

// A limpeza na aplicacao continua sendo a primeira barreira: ela protege o que
// vai ao navegador. Nao protege o PostgREST — por isso ela nao basta, e por isso
// tambem nao pode sumir.
test("a limpeza da aplicacao continua tirando os campos de dinheiro", () => {
  const produto = toPublicCatalogProduct({
    costCents: 9923,
    internalPurchaseSource: { marginCents: 6067 },
    marginPercent: 38,
    name: "Bolsinha lateral",
    priceCents: 15990,
    profitCents: 6067,
    supplierSource: { url: "https://exemplo/loja" }
  });

  for (const campo of [
    "costCents",
    "internalPurchaseSource",
    "marginPercent",
    "profitCents",
    "supplierSource"
  ]) {
    assert.equal(campo in produto, false, `${campo} nao pode sair para o cliente`);
  }

  assert.equal(produto.priceCents, 15990, "o preco continua publico");
});

// As duas tabelas que guardam dinheiro e origem existem com grant revogado. Se
// alguem recriar uma delas com policy publica, o custo volta a vazar por outro
// caminho.
test("as tabelas de custo e de origem continuam sem policy publica", async () => {
  const custos = await source(
    "supabase/migrations/20260530134705_admin_pricing_coupons_storage.sql"
  );
  const origens = await source("supabase/migrations/20260903180000_catalog_supplier_sources.sql");

  for (const [nome, sql] of [
    ["catalog_product_costs", custos],
    ["catalog_product_supplier_sources", origens]
  ]) {
    assert.match(sql, /enable row level security/i, `${nome} sem RLS`);
    assert.match(sql, /revoke all[\s\S]*?on[\s\S]*?from[\s\S]*?anon/i, `${nome} sem revoke para anon`);
    assert.doesNotMatch(sql, /create policy[\s\S]*?to\s+anon/i, `${nome} com policy para anon`);
  }
});
