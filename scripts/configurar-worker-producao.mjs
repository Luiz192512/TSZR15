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
  // Um webhook so no painel do provedor: o segredo de assinatura vale para os
  // dois ambientes.
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

// 2. A armadilha que quase passou: dois tokens de texto diferente abrindo a
// MESMA conta. A variavel de producao guardava a credencial do usuario de
// teste — a loja subiria "funcionando" e o dinheiro nao chegaria em conta
// nenhuma.
const contaProducao = contaDoToken(valores.get("MERCADOPAGO_ACCESS_TOKEN"));
const contaSandbox = contaDoToken(valores.get("MERCADOPAGO_SANDBOX_ACCESS_TOKEN"));

if (contaProducao && contaProducao === contaSandbox) {
  bloqueios.push(
    `MERCADOPAGO_ACCESS_TOKEN abre a MESMA conta do sandbox (${contaProducao}): e credencial de teste na variavel de producao.`
  );
}

// 3. Access token de produção com prefixo de teste.
if (String(valores.get("MERCADOPAGO_ACCESS_TOKEN") ?? "").startsWith("TEST-")) {
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

if (!enviar) {
  console.log("\nNada foi enviado. Para aplicar no Worker:");
  console.log("  npm run producao:configurar -- --enviar\n");
  process.exit(0);
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
    console.error(`  FALHOU   ${item.nome}`);
    console.error(
      `           ${
        String(resultado.stderr ?? "")
          .trim()
          .split("\n")[0]
      }`
    );
    process.exit(1);
  }
}

console.log("\nPronto. Um 'npm run deploy' e necessario se alguma NEXT_PUBLIC_* mudou.\n");
