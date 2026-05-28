import { NextResponse } from "next/server";

import { getSafeAuthRedirectPath } from "@/src/auth/redirects.js";
import { createServerSupabaseClient } from "@/src/lib/supabase/server.js";

function buildRedirect(requestUrl, pathname, params = {}) {
  const redirectUrl = new URL(pathname, requestUrl.origin);

  for (const [key, value] of Object.entries(params)) {
    if (value) {
      redirectUrl.searchParams.set(key, value);
    }
  }

  return NextResponse.redirect(redirectUrl);
}

export async function GET(request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const nextPath = getSafeAuthRedirectPath(requestUrl.searchParams.get("next"), "/conta");

  if (!code) {
    return buildRedirect(requestUrl, "/entrar", {
      error: "Link de autenticacao invalido ou expirado."
    });
  }

  const supabase = await createServerSupabaseClient();

  if (!supabase) {
    return buildRedirect(requestUrl, "/entrar", {
      error: "Configure as variaveis do Supabase antes de autenticar."
    });
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return buildRedirect(requestUrl, "/entrar", {
      error: error.message
    });
  }

  return buildRedirect(requestUrl, nextPath);
}
