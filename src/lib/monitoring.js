// Captura de erros do servidor. Mantido separado de monitoring-client.js de
// propósito: importar @sentry/nextjs aqui arrasta o SDK inteiro para o bundle
// do worker, que não roda em Cloudflare Workers (exige APIs Node/OTEL) e
// estoura o limite de 3 MiB do plano free. Para Sentry no servidor, adotar
// @sentry/cloudflare.
export async function captureServerError(error, context = {}) {
  const { logger } = await import("./logger.js");

  logger.error(
    { err: { message: error?.message, stack: error?.stack }, ...context },
    "server error captured"
  );

  return false;
}
