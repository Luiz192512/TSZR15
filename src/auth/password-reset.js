const SITE_ORIGIN_ENV_KEYS = [
  "NEXT_PUBLIC_SITE_URL",
  "SITE_URL"
];

function normalizeOrigin(value) {
  const rawValue = String(value ?? "").trim().replace(/\/+$/, "");

  if (!rawValue) {
    return "";
  }

  try {
    const parsed = new URL(rawValue.startsWith("http") ? rawValue : `https://${rawValue}`);

    if (!["http:", "https:"].includes(parsed.protocol)) {
      return "";
    }

    return parsed.origin;
  } catch {
    return "";
  }
}

function firstHeaderValue(value) {
  return String(value ?? "").split(",")[0]?.trim() ?? "";
}

export function getConfiguredSiteOrigin() {
  const configuredOrigin = SITE_ORIGIN_ENV_KEYS.map((key) => normalizeOrigin(process.env[key])).find(Boolean);

  if (configuredOrigin) {
    return configuredOrigin;
  }

  return normalizeOrigin(process.env.VERCEL_URL);
}

export function getSiteOriginFromHeaders(headerStore) {
  const configuredOrigin = getConfiguredSiteOrigin();

  if (configuredOrigin) {
    return configuredOrigin;
  }

  const host = firstHeaderValue(headerStore.get("x-forwarded-host")) || firstHeaderValue(headerStore.get("host"));

  if (!host) {
    return "http://localhost:3000";
  }

  const protocol = firstHeaderValue(headerStore.get("x-forwarded-proto")) || "http";

  return normalizeOrigin(`${protocol}://${host}`) || "http://localhost:3000";
}

export function buildPasswordResetRedirectUrl(siteOrigin) {
  const callbackUrl = new URL("/auth/callback", normalizeOrigin(siteOrigin) || "http://localhost:3000");
  callbackUrl.searchParams.set("next", "/trocar-senha");

  return callbackUrl.toString();
}
