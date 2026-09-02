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

function isPreviewRuntime() {
  const explicitTarget = String(
    process.env.SUPABASE_RUNTIME_TARGET ?? process.env.NEXT_PUBLIC_SUPABASE_RUNTIME_TARGET ?? ""
  ).toLowerCase();

  if (explicitTarget) {
    return explicitTarget === "preview";
  }

  return process.env.VERCEL_ENV === "preview";
}

function firstConfiguredEnvValue(keys) {
  return keys.map((key) => process.env[key]).find(Boolean) ?? "";
}

function envKeysForRuntime(previewKeys, fallbackKeys) {
  return isPreviewRuntime() ? [...previewKeys, ...fallbackKeys] : fallbackKeys;
}

export function getSupabaseUrl() {
  return firstConfiguredEnvValue(
    envKeysForRuntime(SUPABASE_PREVIEW_URL_ENV_KEYS, SUPABASE_URL_ENV_KEYS)
  );
}

export function getSupabasePublishableKey() {
  return firstConfiguredEnvValue(
    envKeysForRuntime(SUPABASE_PREVIEW_PUBLISHABLE_KEY_ENV_KEYS, SUPABASE_PUBLISHABLE_KEY_ENV_KEYS)
  );
}

export function getSupabaseServiceRoleKey() {
  return firstConfiguredEnvValue(
    envKeysForRuntime(
      SUPABASE_PREVIEW_SERVICE_ROLE_KEY_ENV_KEYS,
      SUPABASE_SERVICE_ROLE_KEY_ENV_KEYS
    )
  );
}

export function getSupabaseConfigStatus() {
  const url = getSupabaseUrl();
  const publishableKey = getSupabasePublishableKey();
  const urlMessage = isPreviewRuntime()
    ? "NEXT_PUBLIC_SUPABASE_PREVIEW_URL, SUPABASE_PREVIEW_URL, NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_URL"
    : "NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_URL";
  const keyMessage = isPreviewRuntime()
    ? "NEXT_PUBLIC_SUPABASE_PREVIEW_PUBLISHABLE_KEY, SUPABASE_PREVIEW_PUBLISHABLE_KEY, NEXT_PUBLIC_SUPABASE_PREVIEW_ANON_KEY, SUPABASE_PREVIEW_ANON_KEY, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, SUPABASE_PUBLISHABLE_KEY ou SUPABASE_ANON_KEY"
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
