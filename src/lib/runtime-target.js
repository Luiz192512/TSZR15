// Resolução explícita do ambiente de execução (produção x preview).
//
// Duas armadilhas motivam este módulo:
//
// 1. Detecção implícita por plataforma. O código anterior caía em
//    `process.env.VERCEL_ENV === "preview"` quando nenhuma variável explícita
//    estava definida. O deploy é Cloudflare Workers, onde `VERCEL_ENV` nunca
//    existe, então o Worker de preview resolvia para produção em silêncio.
//    Agora o alvo vem só de variável declarada, e valor desconhecido é erro.
//
// 2. Leitura dinâmica de `process.env`. O Next só substitui `process.env.X`
//    quando o acesso é literal; `process.env[chave]` no navegador lê o polyfill
//    vazio e devolve `undefined` para tudo. Por isso as chaves públicas são
//    lidas também do mapa estático abaixo, que o bundler consegue inlinar.

export const PRODUCTION_TARGET = "production";
export const PREVIEW_TARGET = "preview";

const RUNTIME_TARGET_ENV_KEYS = ["SUPABASE_RUNTIME_TARGET", "NEXT_PUBLIC_SUPABASE_RUNTIME_TARGET"];

// Acesso literal, obrigatoriamente: é o que o bundler do Next consegue inlinar
// no bundle do navegador. Só chaves públicas entram aqui — nada de service role.
const INLINED_PUBLIC_ENV = {
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_SUPABASE_PREVIEW_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_PREVIEW_ANON_KEY,
  NEXT_PUBLIC_SUPABASE_PREVIEW_PUBLISHABLE_KEY:
    process.env.NEXT_PUBLIC_SUPABASE_PREVIEW_PUBLISHABLE_KEY,
  NEXT_PUBLIC_SUPABASE_PREVIEW_URL: process.env.NEXT_PUBLIC_SUPABASE_PREVIEW_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  NEXT_PUBLIC_SUPABASE_RUNTIME_TARGET: process.env.NEXT_PUBLIC_SUPABASE_RUNTIME_TARGET,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL
};

export function readEnvValue(key) {
  const runtimeValue = process.env[key];

  if (runtimeValue) {
    return String(runtimeValue);
  }

  return INLINED_PUBLIC_ENV[key] ? String(INLINED_PUBLIC_ENV[key]) : "";
}

export function readFirstEnvValue(keys) {
  return keys.map((key) => readEnvValue(key)).find(Boolean) ?? "";
}

/**
 * Alvo do ambiente. Ausência significa produção — é o comportamento histórico e
 * o que os deploys existentes esperam. Os arquivos `wrangler*.jsonc` declaram o
 * alvo explicitamente nos dois Workers para que ninguém dependa desse default.
 *
 * Valor desconhecido é erro: "staging" ou "prod" resolveriam para produção sem
 * aviso, que é exatamente a falha silenciosa que este módulo existe para matar.
 */
export function getRuntimeTarget() {
  const declared = readFirstEnvValue(RUNTIME_TARGET_ENV_KEYS).trim().toLowerCase();

  if (!declared) {
    return PRODUCTION_TARGET;
  }

  if (declared !== PRODUCTION_TARGET && declared !== PREVIEW_TARGET) {
    throw new Error(
      `SUPABASE_RUNTIME_TARGET inválido: "${declared}". Use "${PRODUCTION_TARGET}" ou "${PREVIEW_TARGET}".`
    );
  }

  return declared;
}

export function isPreviewTarget() {
  return getRuntimeTarget() === PREVIEW_TARGET;
}
