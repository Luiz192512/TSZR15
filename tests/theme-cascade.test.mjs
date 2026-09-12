import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// O teste de tokens (`theme-tokens.test.mjs`) confere o VOCABULARIO: se um token
// existe, se os dois caminhos do tema escuro concordam, se ninguem escreveu
// `rgba(255,255,255,...)` no lugar do canal. Ele nao confere o RESULTADO.
//
// Este arquivo confere o resultado: entre duas regras com o MESMO seletor, a
// ultima vence, e e ela que chega na tela. Uma cor crua enterrada sob uma regra
// posterior nao faz mal nenhum; uma cor crua que VENCE trava o tema naquele
// ponto.
//
// A distincao nao e teorica. O arquivo tem 34 declaracoes de cor crua que
// perdem a cascata, e o relatorio de design chegou a apontar uma delas
// (`.category-token`, com contraste calculado de 1,06:1) como bug de tema —
// medindo com um script que nao enxergava seletor agrupado. Nao havia bug ali.
// Havia dois em outro lugar, e so aparecem quando se olha quem vence.

const ARQUIVOS = [
  "app/storefront.module.css",
  "src/components/catalog/catalog-browser.module.css",
  "src/components/catalog/cart-items-panel.module.css",
  "src/components/mobile-tab-bar.module.css",
  "src/components/site-footer.module.css",
  "src/components/theme/theme-toggle.module.css"
];

const PROPRIEDADES_DE_COR = /^(background|background-color|color|border-color)$/;

// Opaco = sem canal alfa. `rgba(...)` com transparencia se assenta sobre a
// superficie do tema e acompanha a inversao; `#fff` nao acompanha nada.
const COR_OPACA_CRUA = /#[0-9a-fA-F]{3,8}\b|\brgb\(\s*\d/;
const COR_CRUA = /#[0-9a-fA-F]{3,8}\b|\brgba?\(\s*\d/;

// Regras de nivel raiz. O projeto indenta o conteudo de `@media`, entao um
// seletor de topo comeca na coluna 0 — e um seletor agrupado ocupa varias
// linhas, todas na coluna 0, ate a que fecha com `{`.
function regrasDeTopo(css) {
  const linhas = css.replace(/\/\*[\s\S]*?\*\//g, "").split(/\r?\n/);
  const regras = [];
  let atual = null;
  let parcial = "";

  linhas.forEach((linha, indice) => {
    if (atual) {
      if (/^\}/.test(linha)) {
        regras.push(atual);
        atual = null;
        return;
      }
      atual.corpo += linha + "\n";
      return;
    }

    if (!/^[.a-zA-Z[:#*]/.test(linha) && !parcial) return;

    parcial += " " + linha;

    if (!linha.includes("{")) return;

    atual = { corpo: "", linha: indice + 1, seletor: parcial.replace(/\{.*$/, "").trim() };
    parcial = "";
  });

  return regras;
}

// Separa por `;` fora de parenteses: um gradiente tem virgulas e parenteses
// dentro, e parti-lo no lugar errado inventa declaracao que nao existe.
function declaracoes(corpo) {
  const partes = [];
  let atual = "";
  let nivel = 0;

  for (const caractere of corpo) {
    if (caractere === "(") nivel += 1;
    if (caractere === ")") nivel -= 1;

    if (caractere === ";" && nivel === 0) {
      partes.push(atual);
      atual = "";
      continue;
    }

    atual += caractere;
  }

  if (atual.trim()) partes.push(atual);

  return partes
    .map((parte) => parte.trim().replace(/\s+/g, " "))
    .filter((parte) => parte.includes(":"))
    .map((parte) => ({
      prop: parte.slice(0, parte.indexOf(":")).trim(),
      valor: parte.slice(parte.indexOf(":") + 1).trim()
    }));
}

function coresVencedoras(css) {
  const vencedor = new Map();

  for (const regra of regrasDeTopo(css)) {
    const seletores = regra.seletor
      .split(",")
      .map((seletor) => seletor.trim())
      .filter(Boolean);

    for (const { prop, valor } of declaracoes(regra.corpo)) {
      if (!PROPRIEDADES_DE_COR.test(prop)) continue;

      for (const seletor of seletores) {
        vencedor.set(`${seletor}|${prop}`, { linha: regra.linha, prop, seletor, valor });
      }
    }
  }

  return [...vencedor.values()];
}

test("nenhuma cor opaca crua vence a cascata", async () => {
  const infratores = [];

  for (const arquivo of ARQUIVOS) {
    const css = await readFile(new URL(`../${arquivo}`, import.meta.url), "utf8");

    for (const cor of coresVencedoras(css)) {
      if (COR_OPACA_CRUA.test(cor.valor)) {
        infratores.push(
          `${arquivo}:${cor.linha} — ${cor.seletor} { ${cor.prop}: ${cor.valor.slice(0, 40)} }`
        );
      }
    }
  }

  assert.deepEqual(
    infratores,
    [],
    `cor opaca sem token chega na tela e nao inverte com o tema:\n${infratores.join("\n")}`
  );
});

// As cores com alfa acompanham o tema, entao nao sao bug — mas cada uma e uma
// decisao de cor tomada fora do vocabulario. O teto impede que a lista cresca
// sem alguem reparar; baixa-lo quando reduzir e a manutencao esperada.
// 55 medidas nos seis arquivos em 2026-09-08 (52 delas em storefront.module.css).
const TETO_DE_CORES_COM_ALFA = 55;

test("as cores com alfa fora do vocabulario nao aumentam", async () => {
  let total = 0;

  for (const arquivo of ARQUIVOS) {
    const css = await readFile(new URL(`../${arquivo}`, import.meta.url), "utf8");

    total += coresVencedoras(css).filter((cor) => COR_CRUA.test(cor.valor)).length;
  }

  assert.ok(
    total <= TETO_DE_CORES_COM_ALFA,
    `${total} cores cruas vencendo a cascata, teto e ${TETO_DE_CORES_COM_ALFA}`
  );
});

// A causa de tudo acima: o mesmo seletor definido varias vezes no mesmo arquivo,
// as vezes 1.500 linhas depois. Editar a primeira nao muda a tela, e foi
// exatamente isso que fez uma auditoria apontar bug de contraste onde nao havia.
//
// Separar o arquivo por componente e outro trabalho. O teto abaixo faz o que
// cabe agora: impede a lista de crescer sem alguem reparar. Quando o numero
// cair, baixe o teto junto — teto que nao acompanha vira decoracao.
const TETO_DE_SELETORES_DUPLICADOS = 255;

test("os seletores duplicados nao aumentam", async () => {
  const css = await readFile(new URL("../app/storefront.module.css", import.meta.url), "utf8");
  const contagem = new Map();

  for (const regra of regrasDeTopo(css)) {
    for (const seletor of regra.seletor.split(",").map((parte) => parte.trim()).filter(Boolean)) {
      contagem.set(seletor, (contagem.get(seletor) ?? 0) + 1);
    }
  }

  const duplicados = [...contagem.values()].filter((vezes) => vezes > 1).length;

  assert.ok(
    duplicados <= TETO_DE_SELETORES_DUPLICADOS,
    `${duplicados} seletores definidos mais de uma vez, teto e ${TETO_DE_SELETORES_DUPLICADOS}`
  );
});

// Guarda de regressao dos dois bugs reais que este bloco corrigiu, escrita pelo
// efeito e nao pelo valor: se alguem devolver `#fff`, o primeiro teste pega;
// estes dois dizem o que era para acontecer no lugar.
test("o campo de cupom e o icone do menu seguem o tema", async () => {
  const css = await readFile(new URL("../app/storefront.module.css", import.meta.url), "utf8");

  const cupom = coresVencedoras(css).find(
    (cor) => cor.seletor === ".coupon-box input" && cor.prop === "background"
  );

  assert.ok(cupom, "regra do campo de cupom nao encontrada");
  assert.match(cupom.valor, /var\(--/, "o fundo do cupom precisa vir de token");

  const icone = coresVencedoras(css).find(
    (cor) => cor.seletor === ".mobile-menu-icon" && cor.prop === "background"
  );

  assert.ok(icone, "regra do icone do menu nao encontrada");
  assert.match(
    icone.valor,
    /currentColor/,
    "as barras do menu seguem a cor do botao, que ja inverte"
  );
});
