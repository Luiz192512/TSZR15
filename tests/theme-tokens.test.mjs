import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const TOKEN_SOURCE = "app/globals.css";

const THEMED_CSS_FILES = [
  "app/globals.css",
  "app/storefront.module.css",
  "src/components/catalog/catalog-browser.module.css",
  "src/components/catalog/cart-items-panel.module.css",
  "src/components/catalog/catalog-skeleton.module.css",
  "src/components/catalog/infinite-product-rail.module.css",
  "src/components/mobile-tab-bar.module.css",
  "src/components/site-footer.module.css",
  "src/components/form/password-input.module.css",
  "src/components/theme/theme-toggle.module.css"
];

// Os canais existem para que inverter o tema seja trocar uma tripla. Escrever
// a cor crua de novo fura esse mecanismo sem quebrar nada visivelmente, entao
// so um teste segura a regra.
const CHANNEL_LITERALS = [
  {
    label: "rgba(255, 255, 255, …) — use rgb(var(--ink-rgb) / a)",
    pattern: /rgba\(\s*255\s*,\s*255\s*,\s*255\s*,/
  },
  {
    label: "rgba(0, 0, 0, …) — use rgb(var(--shadow-rgb) / a)",
    pattern: /rgba\(\s*0\s*,\s*0\s*,\s*0\s*,/
  },
  {
    label: "rgba(242, 7, 16, …) — use rgb(var(--brand-rgb) / a)",
    pattern: /rgba\(\s*242\s*,\s*7\s*,\s*16\s*,/
  },
  {
    label: "rgba(255, 55, 66, …) — use rgb(var(--brand-alt-rgb) / a)",
    pattern: /rgba\(\s*255\s*,\s*55\s*,\s*66\s*,/
  }
];

async function readCss(file) {
  return readFile(new URL(`../${file}`, import.meta.url), "utf8");
}

// Comentario citando uma cor nao e estilo. Sem isto, a propria documentacao
// dos tokens derruba o teste.
function withoutComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

// Junta TODOS os blocos `:root {` sem condicao — os que valem sempre, para
// qualquer visitante. A versao anterior fatiava do primeiro ":root" ate o
// primeiro "\n}", entao um token declarado num segundo bloco `:root` passava
// como "nao definido" e o teste prometia mais do que verificava.
//
// `:root[data-theme=...]` e `:root:not(...)` ficam DE FORA de proposito: um
// token que so existe no tema escuro nao esta definido para quem usa o claro,
// e e justamente isso que este teste tem que pegar. A igualdade entre os dois
// caminhos do tema escuro e conferida em outro teste deste arquivo.
function definedTokens(css) {
  const tokens = new Set();

  for (const abertura of css.matchAll(/(?:^|\})\s*:root\s*\{/gm)) {
    const inicio = abertura.index + abertura[0].length;
    const fim = css.indexOf("}", inicio);

    if (fim === -1) continue;

    for (const match of css.slice(inicio, fim).matchAll(/(--[a-z0-9-]+)\s*:/g)) {
      tokens.add(match[1]);
    }
  }

  return tokens;
}

// Token que NAO nasce em globals.css, com o lugar onde nasce. A lista existe
// para continuar sendo curta: cada entrada aqui e um token que este teste deixa
// de vigiar, entao cada uma precisa de outro teste que garanta a origem — logo
// abaixo, no caso deste.
const TOKENS_DE_FORA = new Map([
  ["--fonte-marca", "next/font em app/layout.js, injetado como classe no <html>"]
]);

test("todo token usado no CSS esta definido em globals.css", async () => {
  const tokens = definedTokens(await readCss(TOKEN_SOURCE));
  const missing = [];

  for (const file of THEMED_CSS_FILES) {
    const css = await readCss(file);

    for (const match of css.matchAll(/var\(\s*(--[a-z0-9-]+)/g)) {
      if (!tokens.has(match[1]) && !TOKENS_DE_FORA.has(match[1])) {
        missing.push(`${file}: ${match[1]}`);
      }
    }
  }

  assert.deepEqual(missing, []);
});

// A contrapartida da lista acima: se o `next/font` sair do layout, `--fonte-marca`
// vira `var()` sem valor e o texto cai na pilha de fallback sem ninguem notar —
// que e exatamente o problema que a fonte web veio resolver.
test("a fonte da marca continua vindo do next/font e chegando no documento", async () => {
  const layout = await readCss("app/layout.js");

  assert.match(layout, /from "next\/font\/google"/, "next/font saiu do layout");
  assert.match(layout, /variable:\s*"--fonte-marca"/, "o token mudou de nome no layout");
  assert.match(
    layout,
    /className=\{fonteDaMarca\.variable\}/,
    "a classe do next/font precisa estar no <html>, senao o token nao existe em lugar nenhum"
  );

  const globals = await readCss(TOKEN_SOURCE);

  assert.match(
    globals,
    /font-family:\s*var\(--fonte-marca\)[^;]*sans-serif/,
    "o body precisa manter uma pilha de fallback depois do token"
  );
});

test("as familias com alfa passam pelos canais, nao por cor crua", async () => {
  const offenders = [];

  for (const file of THEMED_CSS_FILES) {
    const css = withoutComments(await readCss(file));

    for (const literal of CHANNEL_LITERALS) {
      if (literal.pattern.test(css)) {
        offenders.push(`${file}: ${literal.label}`);
      }
    }
  }

  assert.deepEqual(offenders, []);
});

test("o fundo da pagina vem de token, nao de valor literal", async () => {
  const css = await readCss(TOKEN_SOURCE);

  assert.match(css, /html\s*\{[^}]*background:\s*var\(--surface-page\)/);
  assert.doesNotMatch(css, /background:\s*#050505/);
});

// A camada semantica so serve se os papeis existirem. Se um destes sumir, a
// inversao da fase 2 perde o ponto de troca.
test("os papeis essenciais do tema existem", async () => {
  const tokens = definedTokens(await readCss(TOKEN_SOURCE));

  for (const token of [
    "--ink-rgb",
    "--shadow-rgb",
    "--brand-rgb",
    "--brand-alt-rgb",
    "--surface-page",
    "--surface-raised",
    "--surface-sunken",
    "--surface-panel",
    "--text-primary",
    "--text-secondary",
    "--text-on-filled",
    "--border",
    "--border-strong",
    "--brand",
    "--status-success",
    "--status-warning"
  ]) {
    assert.ok(tokens.has(token), `token ausente: ${token}`);
  }
});

// O tema escuro entra por dois caminhos (preferencia do sistema e escolha
// explicita). Se as duas listas divergirem, um token fica claro dentro do tema
// escuro em um dos caminhos — bug que so aparece na maquina de quem tem a
// preferencia do sistema no valor "errado".
test("os dois caminhos do tema escuro declaram exatamente os mesmos tokens", async () => {
  const css = withoutComments(await readCss(TOKEN_SOURCE));

  const bySystem = css.match(/:root:not\(\[data-theme="light"\]\)\s*\{([^}]*)\}/);
  const byChoice = css.match(/:root\[data-theme="dark"\]\s*\{([^}]*)\}/);

  assert.ok(bySystem, "bloco de preferencia do sistema nao encontrado");
  assert.ok(byChoice, "bloco de escolha explicita nao encontrado");

  const declarations = (block) =>
    [...block.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)]
      .map((match) => `${match[1]}: ${match[2].trim()}`)
      .sort();

  assert.deepEqual(declarations(bySystem[1]), declarations(byChoice[1]));
});

test("color-scheme acompanha o tema nos dois caminhos", async () => {
  const css = withoutComments(await readCss(TOKEN_SOURCE));

  assert.match(css, /:root\s*\{[^}]*color-scheme:\s*light/);
  assert.match(css, /:root:not\(\[data-theme="light"\]\)\s*\{[^}]*color-scheme:\s*dark/);
  assert.match(css, /:root\[data-theme="dark"\]\s*\{[^}]*color-scheme:\s*dark/);
});

// Um modulo com media query propria ignora a escolha do alternador: quem
// escolhesse claro num sistema escuro veria aquele pedaco escuro.
test("nenhum modulo reage a prefers-color-scheme por conta propria", async () => {
  const offenders = [];

  for (const file of THEMED_CSS_FILES.filter((file) => file !== TOKEN_SOURCE)) {
    if (/prefers-color-scheme/.test(withoutComments(await readCss(file)))) {
      offenders.push(file);
    }
  }

  assert.deepEqual(offenders, []);
});

test("todo valor guardado em --dark-* e aplicado por um caminho do tema escuro", async () => {
  const css = withoutComments(await readCss(TOKEN_SOURCE));
  const stored = [...css.matchAll(/(--dark-[a-z0-9-]+)\s*:/g)].map((match) => match[1]);
  const unused = stored.filter((token) => !css.includes(`var(${token})`));

  assert.deepEqual(unused, []);
});

// Os nomes antigos continuam em ~200 call sites. Enquanto nao forem migrados,
// eles precisam continuar resolvendo — e apontando para a camada semantica,
// nao para um valor literal solto.
test("os aliases legados apontam para a camada semantica", async () => {
  const css = await readCss(TOKEN_SOURCE);

  for (const [alias, target] of [
    ["--page", "--surface-page"],
    ["--ink", "--text-primary"],
    ["--muted", "--text-secondary"],
    ["--line", "--border"],
    ["--line-strong", "--border-strong"],
    ["--red", "--brand"],
    ["--surf-1", "--surface-panel"]
  ]) {
    assert.match(
      css,
      new RegExp(`${alias}\\s*:\\s*var\\(${target}\\)`),
      `alias ${alias} deveria apontar para var(${target})`
    );
  }
});

// ---------------------------------------------------------------------------
// Moldura da foto de produto
// ---------------------------------------------------------------------------

// As fotos do catalogo sao 1200x1200 com fundo preto solido e SEM canal alfa —
// conferido nos arquivos com sharp. Clarear a area atras delas so cria uma
// faixa cinza entre o card branco e o preto da foto, que foi a queixa. A
// moldura acompanha a foto nos dois temas.
test("a area de foto usa a moldura escura, nao a superficie da pagina", async () => {
  const globais = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  const loja = await readFile(new URL("../app/storefront.module.css", import.meta.url), "utf8");

  assert.match(globais, /--surface-photo:/);
  assert.match(globais, /--surface-photo-edge:/);

  for (const seletor of [".product-image.has-product-photo {", ".product-photo-main {"]) {
    const bloco = loja.slice(loja.indexOf(seletor), loja.indexOf(seletor) + 320);
    assert.match(bloco, /background: var\(--surface-photo\)/, `${seletor} deveria usar a moldura`);
  }
});

// Encaixotar foto quadrada num 4:3 sobrava faixa e deixava o card maior que a
// imagem — era a queixa do "tamanho errado do card".
test("a area de foto tem a proporcao da foto", async () => {
  const loja = await readFile(new URL("../app/storefront.module.css", import.meta.url), "utf8");

  // So o que exibe FOTO de produto. O 4:3 que sobra e o palco de recorte do
  // admin, onde a proporcao e escolha de quem edita, nao da vitrine.
  const exibemFoto = [
    ".hub-product-card .product-image.has-product-photo,",
    ".product-photo-main {",
    ".admin-upload-preview-media img {"
  ];

  for (const seletor of exibemFoto) {
    const bloco = loja.slice(loja.indexOf(seletor), loja.indexOf(seletor) + 320);
    assert.equal(
      bloco.includes("aspect-ratio: 4 / 3"),
      false,
      `${seletor} nao pode encaixotar foto quadrada num 4:3`
    );
  }

  const card = loja.slice(loja.indexOf(".hub-product-card .product-image.has-product-photo,"));
  assert.match(card.slice(0, 320), /aspect-ratio: 1 \/ 1/);

  const principal = loja.slice(loja.indexOf(".product-photo-main {"));
  assert.match(principal.slice(0, 260), /aspect-ratio: 1 \/ 1/);
});

// A estrela vazia usava rgba solto e dava 2.56:1 no tema claro — abaixo do
// minimo de 3:1 para elemento grafico com significado.
test("a estrela vazia usa token e nao valor solto", async () => {
  const loja = await readFile(new URL("../app/storefront.module.css", import.meta.url), "utf8");
  const bloco = loja.slice(
    loja.indexOf(".review-stars {"),
    loja.indexOf(".review-stars .is-filled")
  );

  assert.match(bloco, /color: var\(--status-neutral\)/);
  assert.equal(/color: rgba\(148, 163, 184/.test(bloco), false);
});
