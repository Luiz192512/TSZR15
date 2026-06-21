let clientInitialized = false;
let serverInitialized = false;

async function getSentry({ dsn, runtime }) {
  if (!dsn) return null;

  const Sentry = await import("@sentry/nextjs");
  const initialized = runtime === "client" ? clientInitialized : serverInitialized;

  if (!initialized) {
    Sentry.init({ dsn, enabled: true, tracesSampleRate: 0.1 });

    if (runtime === "client") {
      clientInitialized = true;
    } else {
      serverInitialized = true;
    }
  }

  return Sentry;
}

export async function captureClientError(error, context = {}) {
  const sentry = await getSentry({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    runtime: "client"
  });

  if (!sentry) return false;

  sentry.captureException(error, { extra: context });
  return true;
}

export async function captureServerError(error, context = {}) {
  const sentry = await getSentry({ dsn: process.env.SENTRY_DSN, runtime: "server" });

  if (!sentry) return false;

  sentry.captureException(error, { extra: context });
  return true;
}
