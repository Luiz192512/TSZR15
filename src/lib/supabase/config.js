const SUPABASE_URL_ENV_KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_URL"
];
const SUPABASE_PUBLISHABLE_KEY_ENV_KEYS = [
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_ANON_KEY"
];

function firstConfiguredEnvValue(keys) {
  return keys.map((key) => process.env[key]).find(Boolean) ?? "";
}

export function getSupabaseUrl() {
  return firstConfiguredEnvValue(SUPABASE_URL_ENV_KEYS);
}

export function getSupabasePublishableKey() {
  return firstConfiguredEnvValue(SUPABASE_PUBLISHABLE_KEY_ENV_KEYS);
}

export function getSupabaseConfigStatus() {
  const url = getSupabaseUrl();
  const publishableKey = getSupabasePublishableKey();

  return {
    isConfigured: Boolean(url && publishableKey),
    missing: [
      ...(!url ? ["NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_URL"] : []),
      ...(!publishableKey
        ? ["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, SUPABASE_PUBLISHABLE_KEY ou SUPABASE_ANON_KEY"]
        : [])
    ]
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
