import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const CSS_FILES = [
  "app/globals.css",
  "app/storefront.module.css",
  "src/components/catalog/catalog-browser.module.css",
  "src/components/catalog/catalog-skeleton.module.css",
  "src/components/catalog/infinite-product-rail.module.css",
  "src/components/payment/payment-experience.module.css",
  "src/components/theme/theme-toggle.module.css"
];

// `transform` e `opacity` sao resolvidas pelo compositor, fora da thread
// principal. Qualquer outra propriedade dentro de um `@keyframes` obriga o
// navegador a refazer layout ou repintar a CADA quadro, e um quadro a 60 fps
// tem 16,7 ms no total — numa animacao infinita isso nunca acaba.
const PROPRIEDADES_DE_COMPOSICAO = new Set(["opacity", "transform"]);

// Excecao unica, medida e mantida de proposito. O ponto que pulsa no rotulo do
// hero tem 7px: a area repintada e de uns 23x23px, custo que nao aparece em
// medicao nenhuma. Trocar por um anel escalando exigiria posicionar um
// pseudo-elemento absoluto sobre o ponto, amarrado ao `padding-left` do rotulo,
// que muda em tres breakpoints — risco visual real por ganho nao mensuravel.
const EXCECOES = new Map([["hero-pulse", "box-shadow"]]);

async function lerCss(arquivo) {
  return readFile(new URL(`../${arquivo}`, import.meta.url), "utf8");
}

function semComentarios(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

// Le o corpo de cada `@keyframes` contando chaves, porque ele tem blocos
// aninhados (`from`, `to`, `70%`) e um regex simples pararia na primeira "}".
function keyframes(css) {
  const encontrados = [];

  for (const abertura of css.matchAll(/@keyframes\s+([\w-]+)\s*\{/g)) {
    let profundidade = 1;
    let i = abertura.index + abertura[0].length;

    while (profundidade > 0 && i < css.length) {
      if (css[i] === "{") profundidade += 1;
      else if (css[i] === "}") profundidade -= 1;
      i += 1;
    }

    encontrados.push({
      corpo: css.slice(abertura.index + abertura[0].length, i - 1),
      nome: abertura[1]
    });
  }

  return encontrados;
}

test("toda animacao mexe so no que o compositor resolve sozinho", async () => {
  const infratores = [];

  for (const arquivo of CSS_FILES) {
    for (const { corpo, nome } of keyframes(semComentarios(await lerCss(arquivo)))) {
      for (const [, propriedade] of corpo.matchAll(/^\s*([a-z-]+)\s*:/gm)) {
        if (PROPRIEDADES_DE_COMPOSICAO.has(propriedade)) continue;
        if (EXCECOES.get(nome) === propriedade) continue;

        infratores.push(`${arquivo}: @keyframes ${nome} anima ${propriedade}`);
      }
    }
  }

  assert.deepEqual(infratores, []);
});

// Nenhum arquivo de CSS pode ficar de fora da regra so por ter sido criado
// depois: a lista acima e a garantia, e ela precisa cobrir o que existe.
test("a regra cobre todo CSS de componente do projeto", async () => {
  const raiz = new URL("../src/components/", import.meta.url);
  const encontrados = [];

  async function varrer(dir, prefixo) {
    for (const entrada of await readdir(dir, { withFileTypes: true })) {
      const caminho = new URL(`${entrada.name}${entrada.isDirectory() ? "/" : ""}`, dir);

      if (entrada.isDirectory()) {
        await varrer(caminho, `${prefixo}${entrada.name}/`);
      } else if (entrada.name.endsWith(".module.css")) {
        encontrados.push(`src/components/${prefixo}${entrada.name}`);
      }
    }
  }

  await varrer(raiz, "");

  const fora = encontrados.filter((arquivo) => !CSS_FILES.includes(arquivo));

  // Um modulo sem `@keyframes` nao precisa estar na lista; um COM precisa.
  const comAnimacao = [];

  for (const arquivo of fora) {
    if (keyframes(semComentarios(await lerCss(arquivo))).length > 0) {
      comAnimacao.push(arquivo);
    }
  }

  assert.deepEqual(comAnimacao, []);
});

// A revelacao some se o navegador nao entender `view()`. O que NAO pode e o
// conteudo sumir junto: fora do `@supports`, um `opacity: 0` deixaria o card
// invisivel para sempre em quem nao tem suporte — hoje, o Firefox estavel.
test("a revelacao so existe onde o navegador sabe termina-la", async () => {
  const css = await lerCss("app/storefront.module.css");
  const inicio = css.indexOf("@supports (animation-timeline: view())");

  assert.ok(inicio > 0, "a revelacao deveria estar dentro de um @supports");

  const bloco = css.slice(inicio, css.indexOf("@keyframes mo-entra"));

  assert.match(bloco, /animation-timeline:\s*view\(\)/);
  assert.match(bloco, /prefers-reduced-motion:\s*no-preference/);

  // O estado final e o estado normal do elemento: o keyframe so tem `from`.
  const keyframe = keyframes(css).find((k) => k.nome === "mo-entra");

  assert.ok(keyframe, "@keyframes mo-entra deveria existir");
  assert.match(keyframe.corpo, /from\s*\{/);
  assert.equal(
    /(^|\s)to\s*\{/.test(keyframe.corpo),
    false,
    "escrever o `to` fixaria o estado final e tiraria a protecao de subtrair do normal"
  );
});

// Rolagem animada e justamente o efeito que causa mal-estar em quem tem
// sensibilidade vestibular, e ela estava ligada sem condicao nenhuma.
test("a rolagem suave respeita quem pediu menos movimento", async () => {
  const css = await lerCss("app/globals.css");

  assert.match(css, /scroll-behavior:\s*smooth/);

  const reduzido = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));

  assert.match(reduzido, /scroll-behavior:\s*auto/);
});
