import "server-only";

import { createClient } from "@supabase/supabase-js";

import { getSupabaseUrl } from "./config.js";

export function createServiceRoleSupabaseClient() {
  const url = getSupabaseUrl();
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SECRET_KEY ??
    "";

  if (!url || !serviceRoleKey) {
    return null;
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}
