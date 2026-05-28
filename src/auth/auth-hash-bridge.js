"use client";

import { useEffect } from "react";

import { createBrowserSupabaseClient } from "@/src/lib/supabase/client.js";

function getHashParams() {
  if (typeof window === "undefined" || !window.location.hash) {
    return null;
  }

  const hash = window.location.hash.replace(/^#/, "");

  if (!hash.includes("access_token") && !hash.includes("error_description")) {
    return null;
  }

  return new URLSearchParams(hash);
}

export function AuthHashBridge() {
  useEffect(() => {
    let isMounted = true;

    async function bridgeRecoveryHash() {
      const params = getHashParams();

      if (!params) {
        return;
      }

      const errorDescription = params.get("error_description");

      if (errorDescription) {
        window.history.replaceState(null, "", window.location.pathname + window.location.search);
        window.location.replace(`/entrar?error=${encodeURIComponent(errorDescription)}`);
        return;
      }

      const accessToken = params.get("access_token");
      const refreshToken = params.get("refresh_token");
      const type = params.get("type");

      if (!accessToken || !refreshToken || type !== "recovery") {
        return;
      }

      const supabase = createBrowserSupabaseClient();

      if (!supabase) {
        window.history.replaceState(null, "", window.location.pathname + window.location.search);
        window.location.replace(
          "/recuperar-senha?error=Configure%20as%20variaveis%20do%20Supabase%20antes%20de%20trocar%20senha."
        );
        return;
      }

      const { error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken
      });

      if (!isMounted) {
        return;
      }

      window.history.replaceState(null, "", window.location.pathname + window.location.search);

      if (error) {
        window.location.replace(`/recuperar-senha?error=${encodeURIComponent(error.message)}`);
        return;
      }

      window.location.replace("/trocar-senha?status=recuperacao");
    }

    bridgeRecoveryHash();

    return () => {
      isMounted = false;
    };
  }, []);

  return null;
}
