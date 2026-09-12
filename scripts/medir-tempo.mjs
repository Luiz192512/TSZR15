// Mede o orcamento de TEMPO da vitrine: o que o cliente sente, num celular
// mediano (CPU 4x mais lenta, rede movel), nao no PC de quem programa.
//
// Existe porque o orcamento da Frente C e em tempo, e tempo nao se estima
// olhando o codigo. Roda antes e depois de cada mudanca de animacao.
//
// Uso:
//   node scripts/medir-tempo.mjs antes
//   node scripts/medir-tempo.mjs depois
//   node scripts/medir-tempo.mjs comparar

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const rotulo = process.argv[2] ?? "antes";
const BASE = process.env.MEDIR_BASE ?? "http://localhost:3100";
const SAIDA = resolve(process.env.TEMP ?? ".", "medicoes-tszr15");

// As rotas que um cliente de verdade percorre para comprar.
const ROTAS = [
  ["home", "/"],
  ["catalogo", "/catalogo"],
  ["produto", "/produto/adesivo-tampa-tanque"]
];

// Limiares oficiais de "bom" do Core Web Vitals, mais o quadro de 60fps.
const LIMITES = {
  "cumulative-layout-shift": { bom: 0.1, nome: "Layout pulando (CLS)", unidade: "" },
  "largest-contentful-paint": { bom: 2500, nome: "Foto principal (LCP)", unidade: "ms" },
  "total-blocking-time": { bom: 200, nome: "Tela travada (TBT)", unidade: "ms" }
};

function chromium() {
  for (const caminho of [
    `${process.env.LOCALAPPDATA}/BraveSoftware/Brave-Browser/Application/brave.exe`,
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Google/Chrome/Application/chrome.exe"
  ]) {
    if (existsSync(caminho)) return caminho;
  }

  return null;
}

function medir(rota, arquivo) {
  const resultado = spawnSync(
    "npx",
    [
      "--yes",
      "lighthouse@12",
      `${BASE}${rota}`,
      "--only-categories=performance",
      "--form-factor=mobile",
      "--output=json",
      `--output-path=${arquivo}`,
      "--chrome-flags=--headless=new --no-sandbox --disable-gpu",
      "--quiet"
    ],
    { encoding: "utf8", env: { ...process.env, CHROME_PATH: chromium() }, shell: true }
  );

  if (!existsSync(arquivo)) {
    console.error(
      `  FALHOU ${rota}: ${String(resultado.stderr ?? "")
        .trim()
        .split("\n")
        .pop()}`
    );

    return null;
  }

  const relatorio = JSON.parse(readFileSync(arquivo, "utf8"));
  const metrica = (chave) => relatorio.audits[chave]?.numericValue ?? null;

  return {
    cls: metrica("cumulative-layout-shift"),
    fcp: metrica("first-contentful-paint"),
    lcp: metrica("largest-contentful-paint"),
    nota: Math.round((relatorio.categories.performance.score ?? 0) * 100),
    tbt: metrica("total-blocking-time"),
    // Quanto do LCP e a tela esperando, e nao a imagem chegando: o numero que
    // uma animacao mal feita piora.
    renderDelayPct: (() => {
      const fases =
        relatorio.audits["largest-contentful-paint-element"]?.details?.items?.[1]?.items ?? [];
      const atraso = fases.find((f) => String(f.phase).includes("Render"));

      return atraso ? Number(atraso.percent?.replace?.("%", "") ?? 0) : null;
    })()
  };
}

function ler(rotulo) {
  const arquivo = resolve(SAIDA, `${rotulo}.json`);

  return existsSync(arquivo) ? JSON.parse(readFileSync(arquivo, "utf8")) : null;
}

mkdirSync(SAIDA, { recursive: true });

if (rotulo === "comparar") {
  const antes = ler("resumo-antes");
  const depois = ler("resumo-depois");

  if (!antes || !depois) {
    console.error("\nFaltam medicoes. Rode 'antes' e 'depois' primeiro.\n");
    process.exit(1);
  }

  console.log("\n=== ANTES x DEPOIS (celular, CPU 4x mais lenta) ===\n");

  let estourou = false;

  for (const [nome] of ROTAS) {
    const a = antes[nome];
    const d = depois[nome];

    if (!a || !d) continue;

    console.log(`  ${nome.toUpperCase()}   nota ${a.nota} -> ${d.nota}`);

    for (const [chave, campo] of [
      ["largest-contentful-paint", "lcp"],
      ["total-blocking-time", "tbt"],
      ["cumulative-layout-shift", "cls"]
    ]) {
      const limite = LIMITES[chave];
      const antesV = a[campo] ?? 0;
      const depoisV = d[campo] ?? 0;
      const delta = depoisV - antesV;
      const casas = campo === "cls" ? 3 : 0;
      const sinal = delta > 0 ? "+" : "";
      // O orcamento e sobre PIORAR: LCP +100ms e TBT +50ms sao os tetos.
      const teto = campo === "lcp" ? 100 : campo === "tbt" ? 50 : 0.01;
      const passou = delta <= teto;

      if (!passou) estourou = true;

      console.log(
        `    ${limite.nome.padEnd(24)} ${antesV.toFixed(casas)} -> ${depoisV.toFixed(casas)}` +
          `  (${sinal}${delta.toFixed(casas)})  ${passou ? "ok" : "ESTOUROU o teto de " + teto}`
      );
    }

    console.log("");
  }

  process.exit(estourou ? 1 : 0);
}

console.log(`\nMedindo "${rotulo}" em ${BASE} — cada rota leva ~30s.\n`);

const resumo = {};

for (const [nome, rota] of ROTAS) {
  process.stdout.write(`  ${nome.padEnd(10)} `);
  const medida = medir(rota, resolve(SAIDA, `${rotulo}-${nome}.json`));

  if (medida) {
    resumo[nome] = medida;
    console.log(
      `nota ${String(medida.nota).padStart(3)}  LCP ${Math.round(medida.lcp)}ms  ` +
        `TBT ${Math.round(medida.tbt)}ms  CLS ${medida.cls.toFixed(3)}` +
        (medida.renderDelayPct ? `  (${medida.renderDelayPct}% do LCP e espera de tela)` : "")
    );
  }
}

const { writeFileSync } = await import("node:fs");
writeFileSync(resolve(SAIDA, `resumo-${rotulo}.json`), JSON.stringify(resumo, null, 2));
console.log(`\nSalvo em ${SAIDA}\n`);
