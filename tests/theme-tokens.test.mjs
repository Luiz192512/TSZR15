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

function definedTokens(css) {
  const rootBlock = css.slice(css.indexOf(":root"), css.indexOf("\n}"));

  return new Set([...rootBlock.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((match) => match[1]));
}

test("todo token usado no CSS esta definido em globals.css", async () => {
  const tokens = definedTokens(await readCss(TOKEN_SOURCE));
  const missing = [];

  for (const file of THEMED_CSS_FILES) {
    const css = await readCss(file);

    for (const match of css.matchAll(/var\(\s*(--[a-z0-9-]+)/g)) {
      if (!tokens.has(match[1])) {
        missing.push(`${file}: ${match[1]}`);
      }
    }
  }

  assert.deepEqual(missing, []);
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
