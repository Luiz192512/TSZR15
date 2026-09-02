import { isPreviewTarget, readEnvValue } from "../lib/runtime-target.js";

export const PAYMENT_PROVIDER = "mercadopago";

// Prefixo do access token de teste da própria aplicação. É prova de sandbox,
// mas a ausência dele não prova nada: no modelo de "usuário de teste" a conta
// fictícia usa `APP_USR-`, igual à conta real.
const SANDBOX_TOKEN_PREFIX = "TEST-";

// O Mercado Pago separa teste e produção nas CREDENCIAIS, e o projeto espelha
// isso em variáveis distintas: o NOME da variável declara o ambiente.
//
// O access token não tem fallback, pela mesma razão que não existe entre os
// projetos Supabase (ver src/lib/supabase/config.js): staging sem credencial
// tem que ficar desligado, nunca cair na produção e cobrar de verdade.
//
// O segredo do webhook é a exceção — ver getPaymentWebhookSecret().
const PRODUCTION_ACCESS_TOKEN_KEYS = ["MERCADOPAGO_ACCESS_TOKEN", "MP_ACCESS_TOKEN"];
const SANDBOX_ACCESS_TOKEN_KEYS = ["MERCADOPAGO_SANDBOX_ACCESS_TOKEN", "MP_SANDBOX_ACCESS_TOKEN"];
// A Public Key NÃO é segredo: ela roda no navegador, e é com ela que o SDK
// tokeniza o cartão para que número e CVV nunca cheguem a este servidor. Por
// isso vai com prefixo NEXT_PUBLIC_ — sem ele o valor não chega ao bundle.
const PRODUCTION_PUBLIC_KEY_KEYS = ["NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY", "MERCADOPAGO_PUBLIC_KEY"];
const SANDBOX_PUBLIC_KEY_KEYS = [
  "NEXT_PUBLIC_MERCADOPAGO_SANDBOX_PUBLIC_KEY",
  "MERCADOPAGO_SANDBOX_PUBLIC_KEY"
];
// UMA chave, os dois ambientes. O painel do Mercado Pago tem um webhook so —
// nao um por aplicacao — entao o segredo de assinatura e compartilhado.
const WEBHOOK_SECRET_KEYS = ["MERCADOPAGO_WEBHOOK_SECRET", "MP_WEBHOOK_SECRET"];
// A chave de habilitacao tambem e por ambiente, e sem fallback: producao nao
// pode ligar porque alguem exportou a variavel pensando no staging.
const PRODUCTION_ENABLED_KEY = "PAYMENTS_ONLINE_ENABLED";
const PREVIEW_ENABLED_KEY = "PAYMENTS_PREVIEW_ONLINE_ENABLED";

function firstEnvValue(keys) {
  return keys.map((key) => readEnvValue(key)).find(Boolean) ?? "";
}

/**
 * Ambiente da credencial. Em staging é sandbox POR CONSTRUÇÃO: o código nem
 * lê a variável de produção, então não há como uma cobrança real escapar por
 * configuração errada.
 */
export function isSandboxPaymentEnvironment() {
  return isPreviewTarget();
}

export function getPaymentAccessToken() {
  return firstEnvValue(
    isSandboxPaymentEnvironment() ? SANDBOX_ACCESS_TOKEN_KEYS : PRODUCTION_ACCESS_TOKEN_KEYS
  );
}

/**
 * Segredo de assinatura do webhook — o mesmo nos dois ambientes.
 *
 * Não há par sandbox/produção aqui porque o provedor não oferece um: o painel
 * tem uma única configuração de webhook. Isso é seguro porque este segredo não
 * move dinheiro, ele só VERIFICA quem enviou o evento. O access token, que
 * autoriza cobrança, continua separado e sem fallback nenhum.
 *
 * Consequência do segredo compartilhado: um evento de produção chega assinado e
 * válido no staging. `applyProviderPayment` resolve — o pagamento não existe no
 * banco de preview e o evento é registrado e ignorado como
 * `pagamento_desconhecido`.
 */
export function getPaymentWebhookSecret() {
  return firstEnvValue(WEBHOOK_SECRET_KEYS);
}

export function getPaymentPublicKey() {
  return firstEnvValue(
    isSandboxPaymentEnvironment() ? SANDBOX_PUBLIC_KEY_KEYS : PRODUCTION_PUBLIC_KEY_KEYS
  );
}

/**
 * Conta a que um access token pertence.
 *
 * O token tem a forma `PREFIXO-<aplicacao>-<data>-<hash>-<conta>`. A conta não é
 * segredo — é o id que aparece no painel — e é o único jeito de descobrir que
 * duas credenciais de texto diferente abrem a MESMA conta.
 */
export function readTokenAccountId(token) {
  const partes = String(token ?? "").split("-");

  return partes.length >= 5 ? partes[partes.length - 1] : "";
}

export function isSandboxPaymentToken(token) {
  return String(token ?? "").startsWith(SANDBOX_TOKEN_PREFIX);
}

/**
 * Public Key colada no lugar do Access Token.
 *
 * É o erro mais fácil de cometer: no painel os dois ficam colados, ambos com o
 * mesmo prefixo, e a API só responde `invalid_token` sem dizer o motivo. A
 * Public Key é PREFIXO + UUID; o Access Token é bem mais longo e tem segmentos
 * numéricos.
 */
export function looksLikePublicKey(value) {
  const corpo = String(value ?? "").replace(/^TEST-|^APP_USR-/, "");

  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(corpo);
}

/**
 * Nome da chave de habilitação no ambiente atual.
 *
 * Exportado porque o diagnóstico e a documentação precisam dizer QUAL variável
 * o operador tem que mexer, e errar isso custa um deploy.
 */
export function getOnlinePaymentFlagKey() {
  return isPreviewTarget() ? PREVIEW_ENABLED_KEY : PRODUCTION_ENABLED_KEY;
}

/**
 * Chave de habilitação, por ambiente e sem fallback.
 *
 * Ausente ou "false" mantém a loja exatamente como está hoje: só o fluxo de
 * WhatsApp Business. Produção sobe com o pagamento DESLIGADO e ele é ligado
 * depois de validado em staging, sem novo deploy.
 *
 * Os dois ambientes têm nomes diferentes pelo mesmo motivo das credenciais:
 * ligar o staging não pode ligar a loja no ar por tabela.
 */
export function isOnlinePaymentEnabled() {
  const flag = readEnvValue(getOnlinePaymentFlagKey()).trim().toLowerCase();

  if (flag !== "true" && flag !== "1") {
    return false;
  }

  // Habilitado sem credencial é configuração pela metade: melhor comportar-se
  // como desligado do que devolver erro de provedor no meio do checkout.
  return Boolean(getPaymentAccessToken() && getPaymentWebhookSecret());
}

/**
 * Motivos pelos quais o pagamento online não pode operar. Vazio = pode.
 *
 * Separado de `isOnlinePaymentEnabled` porque o painel e o log precisam saber
 * POR QUE está desligado, e a rota só precisa saber que está.
 */
export function findPaymentConfigProblems() {
  const problems = [];
  const sandbox = isSandboxPaymentEnvironment();
  const accessToken = getPaymentAccessToken();
  const sufixo = sandbox ? " de sandbox (MERCADOPAGO_SANDBOX_*)" : " de produção";

  if (!accessToken) {
    problems.push(`Access token${sufixo} ausente.`);
  }

  if (!getPaymentWebhookSecret()) {
    problems.push(
      "MERCADOPAGO_WEBHOOK_SECRET ausente: o webhook não teria como validar assinatura. É a mesma chave nos dois ambientes."
    );
  }

  // Public Key no lugar do Access Token: a API responde só `invalid_token` e
  // não diz o motivo, então o diagnóstico precisa vir daqui.
  if (accessToken && looksLikePublicKey(accessToken)) {
    problems.push(
      "O access token tem formato de Public Key (prefixo + UUID). Copie o Access Token, que é o campo logo abaixo no painel."
    );
  }

  if (!getPaymentPublicKey()) {
    problems.push(`Public Key${sufixo} ausente: o cartão não teria como ser tokenizado.`);
  }

  // Credencial trocada de lugar: TEST- na variável de produção, ou uma
  // credencial de conta real gravada como sandbox só é detectável pelo prefixo
  // quando ele existe.
  if (accessToken && !sandbox && isSandboxPaymentToken(accessToken)) {
    problems.push(
      "MERCADOPAGO_ACCESS_TOKEN tem prefixo TEST-: é credencial de sandbox na variável de produção."
    );
  }

  const tokenSandbox = firstEnvValue(SANDBOX_ACCESS_TOKEN_KEYS);
  const tokenProducao = firstEnvValue(PRODUCTION_ACCESS_TOKEN_KEYS);

  if (sandbox && tokenSandbox && tokenSandbox === tokenProducao) {
    problems.push(
      "MERCADOPAGO_SANDBOX_ACCESS_TOKEN é idêntico ao de produção: staging cobraria de verdade."
    );
  }

  // Comparar o TEXTO dos tokens não bastava: dois tokens diferentes podem abrir
  // a mesma conta — foi exatamente o que aconteceu aqui, com a variável de
  // produção guardando a credencial do usuário de TESTE. A loja subiria
  // "funcionando" e o dinheiro do cliente não chegaria em conta nenhuma.
  const contaSandbox = readTokenAccountId(tokenSandbox);
  const contaProducao = readTokenAccountId(tokenProducao);

  if (contaSandbox && contaProducao && contaSandbox === contaProducao) {
    problems.push(
      `As credenciais de sandbox e de produção abrem a MESMA conta (${contaProducao}). A variável de produção tem que ser a da conta real da loja — confira em npm run pagamento:verificar.`
    );
  }

  // Ultimo da lista de proposito: credencial faltando e erro de configuracao,
  // chave desligada e uma DECISAO. Sem esta linha o operador ve "nenhum
  // problema" e nao entende por que a loja continua so no WhatsApp.
  if (problems.length === 0 && !isOnlinePaymentEnabled()) {
    problems.push(
      `Credenciais completas, mas ${getOnlinePaymentFlagKey()} não está "true": o pagamento online segue desligado de propósito.`
    );
  }

  return problems;
}
