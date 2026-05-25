const DEFAULT_AUTH_REDIRECT = "/conta";
const INTERNAL_URL_ORIGIN = "https://tszr15.local";

function isSafeInternalPath(path) {
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) {
    return false;
  }

  if (/[\u0000-\u001f\u007f]/.test(path)) {
    return false;
  }

  try {
    const parsed = new URL(path, INTERNAL_URL_ORIGIN);
    return (
      parsed.origin === INTERNAL_URL_ORIGIN &&
      `${parsed.pathname}${parsed.search}${parsed.hash}` === path
    );
  } catch {
    return false;
  }
}

export function getSafeAuthRedirectPath(value, fallback = DEFAULT_AUTH_REDIRECT) {
  const safeFallback = isSafeInternalPath(fallback) ? fallback : DEFAULT_AUTH_REDIRECT;
  const rawPath = String(value ?? "").trim();

  if (!rawPath || !isSafeInternalPath(rawPath) || rawPath.startsWith("/entrar")) {
    return safeFallback;
  }

  return rawPath;
}
