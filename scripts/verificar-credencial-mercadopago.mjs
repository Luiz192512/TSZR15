// Pergunta ao Mercado Pago de quem e a credencial, sem gerar cobranca.
//
// Existe porque o prefixo do token nao resolve: no modelo de "usuario de teste"
// a credencial do sandbox comeca com APP_USR-, igual a da conta real. Chutar
// errado significa cobrar dinheiro de verdade num teste.
//
// Usa somente GET /users/me — leitura pura. Nenhum pagamento e criado.
//
// Uso: npm run pagamento:verificar

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const envPath = resolve(process.cwd(), ".env.local");

function carregarEnvLocal() {
  let conteudo;

  try {
    conteudo = readFileSync(envPath, "utf8");
  } catch {
    return;
  }

  for (const linha of conteudo.split(/\r?\n/)) {
    const par = linha.match(/^\s*([^#=\s]+)\s*=\s*(.*)\s*$/);

    if (!par) {
      continue;
    }

    const [, chave, valorBruto] = par;

    if (!process.env[chave]) {
      process.env[chave] = valorBruto.replace(/^['"]|['"]$/g, "");
    }
  }
}

// O token nunca e impresso: so o suficiente para o operador reconhecer qual e.
function impressaoDigital(token) {
  const prefixo = token.startsWith("TEST-") ? "TEST-" : token.split("-")[0];

  return `${prefixo}…${token.slice(-6)}`;
}

carregarEnvLocal();

// Sem argumento verifica o conjunto de SANDBOX, que e o que interessa antes de
// qualquer teste. Com --producao, confere o outro lado.
const conjunto = process.argv.includes("--producao") ? "producao" : "sandbox";
const variavel =
  conjunto === "producao" ? "MERCADOPAGO_ACCESS_TOKEN" : "MERCADOPAGO_SANDBOX_ACCESS_TOKEN";
const token = process.env[variavel] ?? "";

if (!token) {
  console.error(`\n${variavel} ausente em .env.local.`);

  if (conjunto === "sandbox") {
    console.error("Para conferir a de producao: npm run pagamento:verificar -- --producao");
  }

  console.error("");
  process.exit(1);
}

// Public Key no lugar do Access Token e o erro mais facil de cometer: no
// painel os dois ficam colados e tem o mesmo prefixo. A API so responde
// "invalid_token" sem dizer o motivo, entao o diagnostico vem daqui.
const corpoDoToken = token.replace(/^TEST-|^APP_USR-/, "");

if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(corpoDoToken)) {
  console.error(`\n${variavel} tem formato de PUBLIC KEY (prefixo + UUID).`);
  console.error("O Access Token e o campo logo abaixo no painel: bem mais longo,");
  console.error("com segmentos numericos. A Public Key vai em");
  console.error(
    conjunto === "producao"
      ? "NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY.\n"
      : "NEXT_PUBLIC_MERCADOPAGO_SANDBOX_PUBLIC_KEY.\n"
  );
  process.exit(2);
}

const resposta = await fetch("https://api.mercadopago.com/users/me", {
  headers: { Authorization: `Bearer ${token}` }
});

if (!resposta.ok) {
  // /users/me e bloqueado por politica para credencial de teste. Nesse caso o
  // prefixo TEST- ja e prova suficiente de sandbox — nao ha o que verificar.
  if (resposta.status === 403 && token.startsWith("TEST-")) {
    console.log(`\n--- Credencial do Mercado Pago (${conjunto}) ---`);
    console.log("variavel     :", variavel);
    console.log("token        :", impressaoDigital(token));
    console.log("");
    console.log("VEREDITO: prefixo TEST- e prova de sandbox. Cobranca nao movimenta");
    console.log("dinheiro real. (/users/me e bloqueado para credencial de teste.)\n");
    process.exit(0);
  }

  console.error(`\nMercado Pago recusou a credencial (HTTP ${resposta.status}).`);
  console.error("Token invalido, revogado, ou de outra aplicacao.\n");
  process.exit(1);
}

const conta = await resposta.json();
const email = String(conta?.email ?? "");
const apelido = String(conta?.nickname ?? "");

// Contas de teste do Mercado Pago usam e-mail @testuser.com e apelido TESTUSER.
const ehContaDeTeste =
  email.endsWith("@testuser.com") || apelido.startsWith("TEST") || token.startsWith("TEST-");

console.log("\n--- Credencial do Mercado Pago ---");
console.log("token        :", impressaoDigital(token));
console.log("conta (id)   :", conta?.id ?? "?");
console.log("apelido      :", apelido || "?");
console.log("e-mail       :", email.replace(/^(.).*(@.*)$/, "$1***$2") || "?");
console.log("pais         :", conta?.site_id ?? "?");
console.log("");

const esperadoDeTeste = conjunto === "sandbox";

if (ehContaDeTeste === esperadoDeTeste) {
  console.log(
    ehContaDeTeste
      ? "VEREDITO: conta de TESTE na variavel de sandbox. Correto — cobranca nao movimenta dinheiro real."
      : "VEREDITO: conta REAL na variavel de producao. Correto — e aqui que a cobranca e de verdade."
  );
  console.log("");
  process.exit(0);
}

if (ehContaDeTeste) {
  console.log("VEREDITO: conta de TESTE na variavel de PRODUCAO.");
  console.log("Nenhuma cobranca real seria processada. Mova para");
  console.log("MERCADOPAGO_SANDBOX_ACCESS_TOKEN.");
} else {
  console.log("VEREDITO: conta REAL na variavel de SANDBOX.");
  console.log("Testar com ela tira dinheiro de verdade da sua conta.");
  console.log("Use as credenciais de teste da aplicacao, ou crie uma");
  console.log("aplicacao logado como usuario de teste.");
}

console.log("");
process.exit(2);
