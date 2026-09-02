import { isPreviewTarget, readFirstEnvValue } from "../runtime-target.js";

const SUPABASE_URL_ENV_KEYS = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL"];
const SUPABASE_PREVIEW_URL_ENV_KEYS = ["NEXT_PUBLIC_SUPABASE_PREVIEW_URL", "SUPABASE_PREVIEW_URL"];
const SUPABASE_PUBLISHABLE_KEY_ENV_KEYS = [
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_ANON_KEY"
];
const SUPABASE_PREVIEW_PUBLISHABLE_KEY_ENV_KEYS = [
  "NEXT_PUBLIC_SUPABASE_PREVIEW_PUBLISHABLE_KEY",
  "SUPABASE_PREVIEW_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SUPABASE_PREVIEW_ANON_KEY",
  "SUPABASE_PREVIEW_ANON_KEY"
];
const SUPABASE_SERVICE_ROLE_KEY_ENV_KEYS = ["SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY"];
const SUPABASE_PREVIEW_SERVICE_ROLE_KEY_ENV_KEYS = [
  "SUPABASE_PREVIEW_SERVICE_ROLE_KEY",
  "SUPABASE_PREVIEW_SECRET_KEY"
];

/**
 * Em preview lemos SOMENTE as chaves de preview.
 *
 * A versão anterior concatenava as chaves de produção como fallback
 * (`[...previewKeys, ...fallbackKeys]`), então um preview com
 * `SUPABASE_PREVIEW_URL` faltando escrevia no banco de produção sem nenhum
 * sinal. Faltar configuração de preview agora significa "não configurado" — o
 * app degrada com cliente nulo, que é o comportamento já esperado em todo o
 * projeto — e nunca significa "usa produção".
 */
function envKeysForRuntime(previewKeys, productionKeys) {
  return isPreviewTarget() ? previewKeys : productionKeys;
}

export function getSupabaseUrl() {
  return readFirstEnvValue(envKeysForRuntime(SUPABASE_PREVIEW_URL_ENV_KEYS, SUPABASE_URL_ENV_KEYS));
}

export function getSupabasePublishableKey() {
  return readFirstEnvValue(
    envKeysForRuntime(SUPABASE_PREVIEW_PUBLISHABLE_KEY_ENV_KEYS, SUPABASE_PUBLISHABLE_KEY_ENV_KEYS)
  );
}

export function getSupabaseServiceRoleKey() {
  return readFirstEnvValue(
    envKeysForRuntime(
      SUPABASE_PREVIEW_SERVICE_ROLE_KEY_ENV_KEYS,
      SUPABASE_SERVICE_ROLE_KEY_ENV_KEYS
    )
  );
}

export function getProductionSupabaseUrl() {
  return readFirstEnvValue(SUPABASE_URL_ENV_KEYS);
}

export function getProductionSupabaseServiceRoleKey() {
  return readFirstEnvValue(SUPABASE_SERVICE_ROLE_KEY_ENV_KEYS);
}

export function getPreviewSupabaseUrl() {
  return readFirstEnvValue(SUPABASE_PREVIEW_URL_ENV_KEYS);
}

export function getPreviewSupabaseServiceRoleKey() {
  return readFirstEnvValue(SUPABASE_PREVIEW_SERVICE_ROLE_KEY_ENV_KEYS);
}

export function getSupabaseConfigStatus() {
  const url = getSupabaseUrl();
  const publishableKey = getSupabasePublishableKey();
  const urlMessage = isPreviewTarget()
    ? "NEXT_PUBLIC_SUPABASE_PREVIEW_URL ou SUPABASE_PREVIEW_URL"
    : "NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_URL";
  const keyMessage = isPreviewTarget()
    ? "NEXT_PUBLIC_SUPABASE_PREVIEW_PUBLISHABLE_KEY, SUPABASE_PREVIEW_PUBLISHABLE_KEY, NEXT_PUBLIC_SUPABASE_PREVIEW_ANON_KEY ou SUPABASE_PREVIEW_ANON_KEY"
    : "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, SUPABASE_PUBLISHABLE_KEY ou SUPABASE_ANON_KEY";

  return {
    isConfigured: Boolean(url && publishableKey),
    missing: [...(!url ? [urlMessage] : []), ...(!publishableKey ? [keyMessage] : [])]
  };
}

export function getPublicSupabaseConfig() {
  const url = getSupabaseUrl();
  const publishableKey = getSupabasePublishableKey();

  return {
    isConfigured: Boolean(url && publishableKey),
    projectRef: getSupabaseProjectRef(url),
    publishableKey,
    url
  };
}

export function getSupabaseProjectRef(url) {
  return String(url ?? "").match(/^https:\/\/([^.]+)\.supabase\.co/)?.[1] ?? "";
}
