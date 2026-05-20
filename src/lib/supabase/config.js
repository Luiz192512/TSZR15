export function getPublicSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    "";

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
