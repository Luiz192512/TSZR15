// Empurra as variaveis de staging do .env.local para o Worker de preview.
//
// Existe para que o unico trabalho manual seja colar os valores UMA vez no
// .env.local. Sem isto seriam oito idas ao painel da Cloudflare, e cada uma
// delas e uma chance de colar a credencial de producao no lugar errado.
//
// Uso:
//   npm run preview:configurar           (mostra o que falta, nao envia nada)
//   npm run preview:configurar -- --enviar

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const enviar = process.argv.includes("--enviar");
const envPath = resolve(process.cwd(), ".env.local");

// O que o Worker de preview precisa. `obrigatoria` marca o que impede o
// staging de funcionar; o resto degrada de forma controlada.
const VARIAVEIS = [
  { nome: "NEXT_PUBLIC_SUPABASE_PREVIEW_URL", obrigatoria: true, segredo: false },
  { nome: "NEXT_PUBLIC_SUPABASE_PREVIEW_PUBLISHABLE_KEY", obrigatoria: true, segredo: false },
  { nome: "SUPABASE_PREVIEW_URL", obrigatoria: true, segredo: false },
  { nome: "SUPABASE_PREVIEW_PUBLISHABLE_KEY", obrigatoria: true, segredo: false },
  { nome: "SUPABASE_PREVIEW_SERVICE_ROLE_KEY", obrigatoria: true, segredo: true },
  { nome: "TSZR15_PREVIEW_ADMIN_TOKEN", obrigatoria: false, segredo: true },
  { nome: "NEXT_PUBLIC_MERCADOPAGO_SANDBOX_PUBLIC_KEY", obrigatoria: false, segredo: false },
  { nome: "MERCADOPAGO_SANDBOX_ACCESS_TOKEN", obrigatoria: false, segredo: true },
  // O painel do provedor tem UM webhook so, entao o segredo de assinatura e o
  // mesmo nos dois ambientes e vai tambem para o Worker de staging.
  { nome: "MERCADOPAGO_WEBHOOK_SECRET", obrigatoria: false, segredo: true },
  // Chave de habilitacao do STAGING. A de producao tem outro nome
  // (PAYMENTS_ONLINE_ENABLED) e nunca sai daqui: ligar o staging nao pode ligar
  // a loja no ar por tabela.
  { nome: "PAYMENTS_PREVIEW_ONLINE_ENABLED", obrigatoria: false, segredo: false },
  { nome: "RESEND_API_KEY", obrigatoria: false, segredo: true },
  { nome: "RESEND_FROM_EMAIL", obrigatoria: false, segredo: false }
];

// Nunca vao para o staging: sao as credenciais da loja no ar.
const PROIBIDAS_EM_STAGING = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "MERCADOPAGO_ACCESS_TOKEN",
  "NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY"
];

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

console.log("\n--- Variaveis do Worker de preview ---\n");

for (const item of presentes) {
  console.log(`  ok    ${item.nome.padEnd(46)} ${mascarar(item.valor)}`);
}

for (const item of ausentes) {
  console.log(`  ${item.obrigatoria ? "FALTA" : "vazia"} ${item.nome}`);
}

// Colar a credencial de producao numa variavel de staging anula a separacao
// inteira de ambientes. Aborta antes de enviar qualquer coisa.
const conflitos = [];

for (const proibida of PROIBIDAS_EM_STAGING) {
  const valorProducao = valores.get(proibida);

  if (!valorProducao) continue;

  for (const item of presentes) {
    if (item.valor === valorProducao) {
      conflitos.push(`${item.nome} tem o mesmo valor de ${proibida}`);
    }
  }
}

if (conflitos.length) {
  console.error("\nABORTADO: credencial de producao em variavel de staging.");
  conflitos.forEach((conflito) => console.error(`  - ${conflito}`));
  console.error("");
  process.exit(1);
}

const faltamObrigatorias = ausentes.filter((item) => item.obrigatoria);

if (faltamObrigatorias.length) {
  console.error(
    `\nFaltam ${faltamObrigatorias.length} variavel(is) obrigatoria(s) em .env.local. Preencha antes de enviar.\n`
  );
  process.exit(1);
}

if (!enviar) {
  console.log("\nNada foi enviado. Para aplicar no Worker:");
  console.log("  npm run preview:configurar -- --enviar\n");
  process.exit(0);
}

console.log("\nEnviando para o Worker tsz-store-preview...\n");

for (const item of presentes) {
  const resultado = spawnSync(
    "npx",
    ["wrangler", "secret", "put", item.nome, "--config", "wrangler.preview.jsonc"],
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

console.log("\nPronto. Agora: npm run deploy:preview\n");
