import { createBrowserClient } from "@supabase/ssr";

import { getPublicSupabaseConfig } from "./config.js";

export function createBrowserSupabaseClient() {
  const config = getPublicSupabaseConfig();

  if (!config.isConfigured) {
    return null;
  }

  return createBrowserClient(config.url, config.publishableKey);
}
