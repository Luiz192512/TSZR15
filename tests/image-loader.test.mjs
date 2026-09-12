import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import productImageLoader from "../src/catalog/image-loader.js";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

const BASE = "https://exemplo.supabase.co/storage/v1/object/public/product-images/bolha";
const DETAIL = `${BASE}/01-bolha-detail.webp`;

test("a largura pedida escolhe a variante que ja existe no bucket", () => {
  assert.match(productImageLoader({ src: DETAIL, width: 200 }), /-thumb\.webp$/);
  assert.match(productImageLoader({ src: DETAIL, width: 640 }), /-card\.webp$/);
  assert.match(productImageLoader({ src: DETAIL, width: 1200 }), /-detail\.webp$/);
});

// A largura pedida quase nunca cai exatamente num dos tres valores: o navegador
// multiplica o slot pela densidade da tela. A regra e sempre subir para a
// variante que cobre — descer entregaria foto esticada.
test("largura intermediaria sobe para a variante que cobre", () => {
  assert.match(productImageLoader({ src: DETAIL, width: 120 }), /-thumb\.webp$/);
  assert.match(productImageLoader({ src: DETAIL, width: 201 }), /-card\.webp$/);
  assert.match(productImageLoader({ src: DETAIL, width: 705 }), /-detail\.webp$/);
  assert.match(productImageLoader({ src: DETAIL, width: 3840 }), /-detail\.webp$/);
});

// Asset de marca e foto ainda nao processada nao tem variante. Inventar um
// sufixo aqui geraria 404 no lugar da imagem.
test("endereco sem variante volta intacto", () => {
  for (const src of ["/brand/logo-tszr15-store.webp", `${BASE}/original.png`, ""]) {
    assert.equal(productImageLoader({ src, width: 640 }), src);
  }
});

// Sem esta regra, reativar `unoptimized` apaga TODO o srcset da loja sem
// quebrar nenhuma tela: o site continua funcionando, so que o celular volta a
// baixar a foto do desktop. So um teste segura isso.
test("o next.config usa o carregador em vez de desligar o otimizador", async () => {
  const config = (await source("next.config.mjs")).replace(/\/\/[^\n]*/g, "");

  assert.doesNotMatch(config, /unoptimized:\s*true/, "unoptimized global apaga o srcset");
  assert.match(config, /loader:\s*"custom"/);
  assert.match(config, /loaderFile:\s*"\.\/src\/catalog\/image-loader\.js"/);
});

// As larguras anunciadas no srcset precisam existir como ARQUIVO. Se o script
// de otimizacao passar a gerar outros tamanhos e a config nao acompanhar, o
// navegador escolhe uma largura que ninguem gerou.
test("as larguras da config sao as variantes que o script gera", async () => {
  const config = await source("next.config.mjs");
  const script = await source("scripts/optimize-product-images.mjs");

  const geradas = [...script.matchAll(/maxWidth:\s*(\d+)/g)].map((match) => Number(match[1]));
  const anunciadas = [
    ...(config.match(/deviceSizes:\s*\[([^\]]*)\]/)?.[1] ?? "").split(","),
    ...(config.match(/imageSizes:\s*\[([^\]]*)\]/)?.[1] ?? "").split(",")
  ]
    .map((valor) => Number(valor.trim()))
    .filter(Boolean);

  assert.deepEqual(anunciadas.sort((a, b) => a - b), geradas.sort((a, b) => a - b));
});
