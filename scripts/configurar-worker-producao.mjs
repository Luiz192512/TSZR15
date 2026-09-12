// Empurra as variaveis de PRODUCAO do .env.local para o Worker da loja no ar.
//
// Existe pelo mesmo motivo do configurar-worker-preview.mjs, mas com o risco
// invertido: la o pior caso e o staging nao funcionar; aqui e a loja no ar
// cobrar cliente de verdade com a configuracao errada. Por isso este script
// recusa mais do que envia.
//
// Uso:
//   npm run producao:configurar            (mostra o diagnostico, nao envia)
//   npm run producao:configurar -- --enviar

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { avaliarPortaoDeVersao } from "./worker-version-gate.mjs";

const enviar = process.argv.includes("--enviar");
const envPath = resolve(process.cwd(), ".env.local");

// O que o Worker de producao le em tempo de execucao.
const VARIAVEIS = [
  { nome: "NEXT_PUBLIC_SUPABASE_URL", obrigatoria: true, segredo: false },
  { nome: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", obrigatoria: true, segredo: false },
  { nome: "SUPABASE_SERVICE_ROLE_KEY", obrigatoria: true, segredo: true },
  { nome: "TSZR15_ADMIN_TOKEN", obrigatoria: true, segredo: true },
  { nome: "NEXT_PUBLIC_WHATSAPP_BUSINESS_NUMBER", obrigatoria: true, segredo: false },
  { nome: "WHATSAPP_BUSINESS_NUMBER", obrigatoria: true, segredo: false },
  { nome: "NEXT_PUBLIC_STORE_NAME", obrigatoria: false, segredo: false },
  { nome: "RESEND_API_KEY", obrigatoria: false, segredo: true },
  { nome: "RESEND_FROM_EMAIL", obrigatoria: false, segredo: false },
  { nome: "REVALIDATE_SECRET", obrigatoria: false, segredo: true },
  { nome: "MERCADOPAGO_ACCESS_TOKEN", obrigatoria: false, segredo: true },
  // O painel tem uma URL de webhook para o modo teste e outra para o modo
  // producao, mas a assinatura secreta e UMA por aplicacao: o segredo vale para
  // os dois ambientes.
  { nome: "MERCADOPAGO_WEBHOOK_SECRET", obrigatoria: false, segredo: true },
  { nome: "PAYMENTS_ONLINE_ENABLED", obrigatoria: false, segredo: false }
];

// NUNCA vao para a loja no ar. Mandar uma credencial de staging para producao
// desfaz o isolamento inteiro entre os dois ambientes.
const PROIBIDAS = [
  "SUPABASE_PREVIEW_URL",
  "NEXT_PUBLIC_SUPABASE_PREVIEW_URL",
  "SUPABASE_PREVIEW_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SUPABASE_PREVIEW_PUBLISHABLE_KEY",
  "SUPABASE_PREVIEW_SERVICE_ROLE_KEY",
  "TSZR15_PREVIEW_ADMIN_TOKEN",
  "MERCADOPAGO_SANDBOX_ACCESS_TOKEN",
  "NEXT_PUBLIC_MERCADOPAGO_SANDBOX_PUBLIC_KEY",
  "PAYMENTS_PREVIEW_ONLINE_ENABLED",
  // Credencial de outro provedor: nao tem por que existir num Worker.
  "VERCEL_TOKEN",
  "VERCEL_PROJECT_ID"
];

// Gravadas no BUILD, nao em tempo de execucao: o Next inlina NEXT_PUBLIC_* no
// bundle do navegador. Mandar como segredo do Worker nao tem efeito nenhum, e
// da a falsa impressao de que foi configurado.
const SOMENTE_NO_BUILD = ["NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY"];

function carregarEnvLocal() {
  const valores = new Map();
  let conteudo;

  try {
    conteudo = readFileSync(envPath, "utf8");
  } catch {
    console.error("\n.env.local nao encontrado.\n");
    process.exit(1);
  }

  for (const linha of conteudo.split(/\r?\n/)) {
    const par = linha.match(/^\s*([^#=\s]+)\s*=\s*(.*)\s*$/);

    if (par) {
      valores.set(par[1], par[2].replace(/^['"]|['"]$/g, ""));
    }
  }

  return valores;
}

// Valor nunca aparece inteiro: so o suficiente para conferir que e o certo.
function mascarar(valor) {
  return valor.length <= 8 ? "********" : `${valor.slice(0, 4)}…${valor.slice(-4)}`;
}

// A conta fica no ultimo segmento do access token do Mercado Pago. Nao e
// segredo — e o id que aparece no painel.
function contaDoToken(token) {
  const partes = String(token ?? "").split("-");

  return partes.length >= 5 ? partes[partes.length - 1] : "";
}

// Saida JSON do wrangler, ou null. Falha de login, de rede ou de formato vira
// null — e null nunca libera o envio.
function wranglerJson(argumentos) {
  const resultado = spawnSync(
    "npx",
    ["wrangler", ...argumentos, "--config", "wrangler.jsonc", "--json"],
    { encoding: "utf8", shell: process.platform === "win32" }
  );

  if (resultado.status !== 0) {
    return null;
  }

  try {
    return JSON.parse(resultado.stdout);
  } catch {
    return null;
  }
}

function dataLocal(iso) {
  const data = new Date(iso);

  return Number.isNaN(data.getTime())
    ? "?"
    : data.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

function explicarBloqueio(portao) {
  if (portao.motivo !== "versao_nao_publicada_na_frente") {
    console.error(
      "\n  FALHA  nao deu para conferir as versoes do Worker (wrangler sem login, sem rede,"
    );
    console.error(
      "         ou a versao no ar ficou fora da lista). Sem essa conferencia nada e enviado."
    );
    return;
  }

  console.error("\n  BLOQUEADO  versao enviada e nunca publicada na frente da que serve:");

  for (const versao of portao.servindo) {
    console.error(`             no ar          ${versao.id.slice(0, 8)}  ${dataLocal(versao.criadaEm)}`);
  }

  for (const versao of portao.naoPublicadas) {
    console.error(`             nao publicada  ${versao.id.slice(0, 8)}  ${dataLocal(versao.criadaEm)}`);
  }

  console.error(
    [
      "",
      "  Enquanto isso valer, a Cloudflare recusa todo 'wrangler secret put'. Neste",
      "  projeto a causa e o build de branch, que envia versao para o Worker de",
      "  producao sem publicar.",
      "",
      "  Saida: publicar 'main' e rodar este script LOGO EM SEGUIDA, antes de",
      "  qualquer push de branch.",
      "",
      "  Nao contorne com 'wrangler versions secret put': ele cria a versao nova a",
      "  partir da mais recente — a nao publicada — e publica-la leva codigo de",
      "  branch nao revisado para a loja no ar.",
      ""
    ].join("\n")
  );
}

const valores = carregarEnvLocal();
const presentes = [];
const ausentes = [];

for (const variavel of VARIAVEIS) {
  const valor = valores.get(variavel.nome) ?? "";

  if (valor) {
    presentes.push({ ...variavel, valor });
  } else {
    ausentes.push(variavel);
  }
}

console.log("\n--- Variaveis do Worker de PRODUCAO ---\n");

for (const item of presentes) {
  console.log(`  ok    ${item.nome.padEnd(40)} ${mascarar(item.valor)}`);
}

for (const item of ausentes) {
  console.log(`  ${item.obrigatoria ? "FALTA" : "vazia"} ${item.nome}`);
}

const bloqueios = [];

// 1. Credencial de staging com o nome de producao.
for (const proibida of PROIBIDAS) {
  const valorStaging = valores.get(proibida);

  if (!valorStaging) continue;

  for (const item of presentes) {
    if (item.valor === valorStaging) {
      bloqueios.push(`${item.nome} tem o mesmo valor de ${proibida}, que e de staging.`);
    }
  }
}

// 2. Credencial de dinheiro real na variavel de sandbox: staging cobraria de
// verdade. A conta ser a mesma e o que confirma que nao e o outro modelo valido
// (usuario de teste, que tem conta propria).
//
// O contrario — os dois tokens abrindo a mesma conta com prefixos diferentes —
// e a configuracao NORMAL: uma aplicacao emite APP_USR- e TEST- para a mesma
// conta. Este script chegou a bloquear isso por engano.
const tokenProducao = valores.get("MERCADOPAGO_ACCESS_TOKEN") ?? "";
const tokenSandbox = valores.get("MERCADOPAGO_SANDBOX_ACCESS_TOKEN") ?? "";

if (
  tokenSandbox &&
  !tokenSandbox.startsWith("TEST-") &&
  contaDoToken(tokenSandbox) === contaDoToken(tokenProducao)
) {
  bloqueios.push(
    "MERCADOPAGO_SANDBOX_ACCESS_TOKEN e credencial de producao da mesma conta: staging cobraria dinheiro real."
  );
}

// 3. Access token de producao com prefixo de teste: nao cobraria nada.
if (tokenProducao.startsWith("TEST-")) {
  bloqueios.push("MERCADOPAGO_ACCESS_TOKEN tem prefixo TEST-: e credencial de sandbox.");
}

for (const nome of SOMENTE_NO_BUILD) {
  if (valores.get(nome)) {
    console.log(
      `\n  nota  ${nome} e gravada no BUILD, nao aqui.\n        Ela chega ao navegador por 'npm run deploy', que le o .env.local.`
    );
  }
}

if (bloqueios.length) {
  console.error("\nABORTADO: configuracao que cobraria errado na loja no ar.");
  bloqueios.forEach((bloqueio) => console.error(`  - ${bloqueio}`));
  console.error("");
  process.exit(1);
}

const faltamObrigatorias = ausentes.filter((item) => item.obrigatoria);

if (faltamObrigatorias.length) {
  console.error(
    `\nFaltam ${faltamObrigatorias.length} variavel(is) obrigatoria(s) em .env.local.\n`
  );
  process.exit(1);
}

// 4. A Cloudflare so aceita segredo quando a versao mais nova do Worker e a que
// esta no ar. Conferido tambem no diagnostico: antes, o bloqueio so aparecia no
// --enviar, como erro cru do wrangler na primeira variavel.
const portao = avaliarPortaoDeVersao({
  deployment: wranglerJson(["deployments", "status"]),
  versoes: wranglerJson(["versions", "list"])
});

if (portao.liberado) {
  const noAr = portao.servindo[portao.servindo.length - 1];

  console.log(`\n  ok    versao mais nova esta no ar (${noAr.id.slice(0, 8)})`);
} else {
  explicarBloqueio(portao);
}

if (!enviar) {
  console.log("\nNada foi enviado. Para aplicar no Worker:");
  console.log("  npm run producao:configurar -- --enviar\n");
  process.exit(0);
}

if (!portao.liberado) {
  console.error("ABORTADO: nada foi enviado.\n");
  process.exit(1);
}

console.log("\nEnviando para o Worker tsz-store...\n");

for (const item of presentes) {
  const resultado = spawnSync(
    "npx",
    ["wrangler", "secret", "put", item.nome, "--config", "wrangler.jsonc"],
    { encoding: "utf8", input: item.valor, shell: process.platform === "win32" }
  );

  if (resultado.status === 0) {
    console.log(`  enviada  ${item.nome}`);
  } else {
    const erro = String(resultado.stderr ?? "").trim();

    console.error(`  FALHOU   ${item.nome}`);
    console.error(`           ${erro.split("\n")[0]}`);

    // A conferencia acima passou, mas um push de branch pode ter enviado versao
    // nova entre ela e este envio.
    if (erro.includes("isn't currently deployed")) {
      console.error("\n  Uma versao nova apareceu durante o envio. Rode o diagnostico de novo:");
      console.error("  npm run producao:configurar\n");
    }

    process.exit(1);
  }
}

console.log("\nPronto. Um 'npm run deploy' e necessario se alguma NEXT_PUBLIC_* mudou.\n");
