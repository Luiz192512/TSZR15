"use client";

// Stub sem Sentry: o pacote @sentry/nextjs foi removido porque client
// components também entram no bundle SSR do worker (Cloudflare, limite de
// 3 MiB no plano free) e nenhum DSN está configurado. Para reativar
// monitoramento, usar @sentry/cloudflare no servidor e o loader/browser SDK
// no cliente, mantendo esta API.
export async function captureClientError(error, context = {}) {
  console.error("client error captured", error, context);
  return false;
}
