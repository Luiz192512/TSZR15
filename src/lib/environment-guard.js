import {
  getPreviewSupabaseServiceRoleKey,
  getPreviewSupabaseUrl,
  getProductionSupabaseServiceRoleKey,
  getProductionSupabaseUrl
} from "./supabase/config.js";
import { PREVIEW_TARGET, getRuntimeTarget, readEnvValue } from "./runtime-target.js";

// Teste e produção do Mercado Pago vivem em variáveis distintas, como os dois
// projetos Supabase. O ambiente é decidido pelo NOME da variável, não por
// heurística sobre o valor — o prefixo "TEST-" só existe num dos dois modelos
// de sandbox do provedor e não serve para distinguir o outro.
const SANDBOX_PAYMENT_TOKEN_PREFIX = "TEST-";
const PAYMENT_ACCESS_TOKEN_ENV_KEYS = ["MERCADOPAGO_ACCESS_TOKEN", "MP_ACCESS_TOKEN"];
const SANDBOX_PAYMENT_ACCESS_TOKEN_ENV_KEYS = [
  "MERCADOPAGO_SANDBOX_ACCESS_TOKEN",
  "MP_SANDBOX_ACCESS_TOKEN"
];

function firstEnvValue(keys) {
  return keys.map((key) => readEnvValue(key)).find(Boolean) ?? "";
}

/**
 * Incoerências entre alvo e credenciais.
 *
 * Só reporta MISTURA detectável — dois valores que precisam ser diferentes e
 * são iguais, ou credencial do tipo errado para o alvo. Configuração ausente
 * não entra aqui: o projeto inteiro degrada com cliente nulo quando falta
 * variável, e transformar isso em erro fatal derrubaria produção por omissão.
 */
export function findEnvironmentIncoherences() {
  const target = getRuntimeTarget();
  const isPreview = target === PREVIEW_TARGET;
  const problems = [];

  const productionUrl = getProductionSupabaseUrl();
  const previewUrl = getPreviewSupabaseUrl();

  if (productionUrl && previewUrl && productionUrl === previewUrl) {
    problems.push(
      "SUPABASE_PREVIEW_URL aponta para o mesmo projeto de NEXT_PUBLIC_SUPABASE_URL. O preview escreveria no banco de produção."
    );
  }

  const productionServiceRoleKey = getProductionSupabaseServiceRoleKey();
  const previewServiceRoleKey = getPreviewSupabaseServiceRoleKey();

  if (
    productionServiceRoleKey &&
    previewServiceRoleKey &&
    productionServiceRoleKey === previewServiceRoleKey
  ) {
    problems.push(
      "SUPABASE_PREVIEW_SERVICE_ROLE_KEY é idêntica à chave de serviço de produção. Gere uma chave do projeto de preview."
    );
  }

  if (isPreview && productionServiceRoleKey && !previewServiceRoleKey) {
    problems.push(
      "Alvo é preview, mas só existe SUPABASE_SERVICE_ROLE_KEY de produção no ambiente. Remova a chave de produção do Worker de preview."
    );
  }

  const productionPaymentToken = firstEnvValue(PAYMENT_ACCESS_TOKEN_ENV_KEYS);
  const sandboxPaymentToken = firstEnvValue(SANDBOX_PAYMENT_ACCESS_TOKEN_ENV_KEYS);

  // Mesma credencial nos dois lados anula a separação: staging cobraria de
  // verdade achando que está em sandbox.
  if (
    productionPaymentToken &&
    sandboxPaymentToken &&
    productionPaymentToken === sandboxPaymentToken
  ) {
    problems.push(
      "MERCADOPAGO_SANDBOX_ACCESS_TOKEN é idêntico ao de produção. Staging faria cobrança real."
    );
  }

  // Credencial de sandbox na variável de produção: cobranças reais nunca seriam
  // processadas. Só detectável quando o prefixo existe.
  if (productionPaymentToken && productionPaymentToken.startsWith(SANDBOX_PAYMENT_TOKEN_PREFIX)) {
    problems.push(
      "MERCADOPAGO_ACCESS_TOKEN tem prefixo TEST-: credencial de sandbox na variável de produção."
    );
  }

  // Em staging o app nem lê a variável de produção, então ter a credencial real
  // presente no ambiente do Worker de preview é risco desnecessário.
  if (isPreview && productionPaymentToken && !sandboxPaymentToken) {
    problems.push(
      "Alvo é preview e só existe a credencial de pagamento de produção. Configure MERCADOPAGO_SANDBOX_ACCESS_TOKEN, ou remova a de produção do Worker de preview."
    );
  }

  const adminToken = readEnvValue("TSZR15_ADMIN_TOKEN");
  const previewAdminToken = readEnvValue("TSZR15_PREVIEW_ADMIN_TOKEN");

  if (adminToken && previewAdminToken && adminToken === previewAdminToken) {
    problems.push(
      "TSZR15_PREVIEW_ADMIN_TOKEN é idêntico ao token de produção. Gere um token exclusivo para o preview."
    );
  }

  return problems;
}

let cachedAssertion = null;

/**
 * Falha alto. Chamado na inicialização (`instrumentation.js`) e no ponto de uso
 * do cliente com service role, que é onde a escrita realmente acontece — o hook
 * de inicialização sozinho não cobre todo caminho de execução no Worker.
 */
export function assertEnvironmentIsCoherent() {
  if (cachedAssertion) {
    if (cachedAssertion.error) {
      throw cachedAssertion.error;
    }

    return;
  }

  const problems = findEnvironmentIncoherences();
  const error = problems.length
    ? new Error(
        `Ambiente incoerente (alvo "${getRuntimeTarget()}"):\n- ${problems.join("\n- ")}\n` +
          "Corrija as variáveis antes de subir. Ver docs/AMBIENTES.md."
      )
    : null;

  cachedAssertion = { error };

  if (error) {
    throw error;
  }
}

export function resetEnvironmentAssertionCache() {
  cachedAssertion = null;
}
