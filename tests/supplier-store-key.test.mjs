import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { LOJA_SEM_ORIGEM, normalizeStoreKey } from "../src/orders/supplier-store.js";

const MIGRACAO = "supabase/migrations/20260903180000_catalog_supplier_sources.sql";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

// GABARITO TIRADO DO POSTGRES DE VERDADE. Cada linha e a saida real de
// `select public.build_supplier_store_key(canal, nome)` rodada no banco de
// preview depois de aplicar a migracao — nao e o que eu achei que a funcao
// faria, e o que ela fez.
//
// A chave decide DUAS coisas que nao podem discordar: como os itens de um
// pedido sao agrupados numa compra por loja, e qual a chave de idempotencia
// dessa compra. Divergencia entre banco e aplicacao significa compra duplicada
// no fornecedor — dinheiro real saindo duas vezes.
const GABARITO = [
  ["shopee", "Loja Alfa", "shopee:loja-alfa"],
  ["shopee", "loja alfa", "shopee:loja-alfa"],
  ["shopee", "  Lója   Alfa  ", "shopee:loja-alfa"],
  ["aliexpress", "Beta Store", "aliexpress:beta-store"],
  ["aliexpress", "Beta  --  Store!!", "aliexpress:beta-store"],
  ["shopee", "Açaí & Cia", "shopee:acai-cia"],
  ["shopee", "Ção Ñandu", "shopee:cao-nandu"],
  ["SHOPEE", "Loja Alfa", "shopee:loja-alfa"],
  ["", "Sem Canal", "outro:sem-canal"],
  [null, "Canal Nulo", "outro:canal-nulo"],
  ["shopee", "", null],
  ["shopee", "   ", null],
  ["shopee", "---", null],
  ["shopee", "###", null],
  ["shopee", "Loja 123", "shopee:loja-123"],
  ["outro", "Fornecedor  do  Bairro", "outro:fornecedor-do-bairro"]
];

test("a chave da loja em JS bate com a do banco", () => {
  const divergentes = [];

  for (const [canal, nome, esperado] of GABARITO) {
    const obtido = normalizeStoreKey(canal, nome);

    if (obtido !== esperado) {
      divergentes.push(
        `canal=${JSON.stringify(canal)} nome=${JSON.stringify(nome)}: banco ${JSON.stringify(
          esperado
        )}, aplicacao ${JSON.stringify(obtido)}`
      );
    }
  }

  assert.deepEqual(divergentes, []);
});

// Nome composto so de pontuacao normaliza para nada. Devolver "shopee:" daria a
// DUAS lojas diferentes a mesma chave, e os itens das duas cairiam na mesma
// compra. As duas implementacoes precisam recusar isso.
test("nome sem letra nem numero nao vira loja", async () => {
  for (const nome of ["---", "###", "  ...  ", "!!!"]) {
    assert.equal(normalizeStoreKey("shopee", nome), null, `${nome} nao deveria virar chave`);
  }

  // E a mesma recusa precisa estar no banco, senao o agrupamento do SQL e a
  // idempotencia da aplicacao discordam justamente no caso degenerado.
  const sql = await source(MIGRACAO);

  assert.match(sql, /when apelido\.valor = ''\s*\n?\s*then null/);
});

test("a acentuacao e a mesma nos dois lados", async () => {
  const sql = await source(MIGRACAO);

  // As duas tabelas de translate() precisam existir literalmente na migracao,
  // na mesma ordem da copia em JS.
  assert.ok(sql.includes("'áàâãäéèêëíìîïóòôõöúùûüçñ'"), "a tabela de acentos mudou no SQL");
  assert.ok(sql.includes("'aaaaaeeeeiiiiooooouuuucn'"), "a tabela sem acento mudou no SQL");

  const js = await source("src/orders/supplier-store.js");

  assert.ok(js.includes('"áàâãäéèêëíìîïóòôõöúùûüçñ"'), "a tabela de acentos mudou no JS");
  assert.ok(js.includes('"aaaaaeeeeiiiiooooouuuucn"'), "a tabela sem acento mudou no JS");
});

// O item cujo produto nao tem origem cadastrada precisa cair em ALGUM grupo.
// Sem isso ele sai do agrupamento e ninguem compra — o pedido fica pago e
// incompleto sem nada apontando o erro.
test("existe um grupo para o produto sem origem", () => {
  assert.equal(typeof LOJA_SEM_ORIGEM, "string");
  assert.ok(LOJA_SEM_ORIGEM.length > 0);

  // Nao pode colidir com uma chave real, que sempre tem ":".
  assert.equal(LOJA_SEM_ORIGEM.includes(":"), false);
});

// ---------------------------------------------------------------------------
// A tabela nasce fora do alcance da chave publicavel
// ---------------------------------------------------------------------------

// O link do fornecedor e a informacao que o dono da loja mais precisa esconder:
// com ele, o cliente compra direto na origem. `catalog_products` tem SELECT
// liberado para anon/authenticated de proposito, entao a origem NAO pode morar
// la — nem numa coluna nova, nem dentro do jsonb `internal_purchase_source`.
test("a origem do produto tem as tres camadas de protecao", async () => {
  const sql = await source(MIGRACAO);

  assert.match(
    sql,
    /alter table public\.catalog_product_supplier_sources enable row level security/
  );
  assert.match(
    sql,
    /revoke all on public\.catalog_product_supplier_sources from anon, authenticated/
  );
  assert.match(
    sql,
    /grant select, insert, update, delete on public\.catalog_product_supplier_sources to service_role/
  );

  // Nenhuma policy: mesmo que um grant volte por engano, nao ha linha visivel.
  assert.equal(
    /create policy/i.test(sql),
    false,
    "uma policy aqui abriria a tabela para quem tiver a chave publicavel"
  );
});

test("o link do fornecedor nunca entra na projecao publica do catalogo", async () => {
  const colunas = await source("src/catalog/supabase-catalog-core.js");
  const bloco = colunas.slice(
    colunas.indexOf("publicCatalogProductColumns"),
    colunas.indexOf("publicCatalogProductColumns") + 1400
  );

  for (const proibido of ["supplier", "source_product_url", "store_key"]) {
    assert.equal(
      bloco.toLowerCase().includes(proibido),
      false,
      `a projecao publica do catalogo nao pode pedir ${proibido}`
    );
  }
});
