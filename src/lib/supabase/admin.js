import "server-only";

import { createClient } from "@supabase/supabase-js";

import { assertEnvironmentIsCoherent } from "../environment-guard.js";
import { getSupabaseServiceRoleKey, getSupabaseUrl } from "./config.js";

export function createServiceRoleSupabaseClient() {
  // Ponto de uso: é aqui que a escrita privilegiada acontece. Se o ambiente
  // estiver misturado, o pedido não pode ser gravado "no banco errado com sorte".
  assertEnvironmentIsCoherent();

  const url = getSupabaseUrl();
  const serviceRoleKey = getSupabaseServiceRoleKey();

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
