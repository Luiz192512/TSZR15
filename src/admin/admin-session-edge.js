import {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_MAX_AGE_SECONDS,
  ADMIN_SESSION_VERSION
} from "./admin-session-constants.js";

export { ADMIN_SESSION_COOKIE, ADMIN_SESSION_MAX_AGE_SECONDS };

const encoder = new TextEncoder();

function getConfiguredAdminToken() {
  return process.env.TSZR15_ADMIN_TOKEN ?? "";
}

function isAdminTokenValueConfigured(token = getConfiguredAdminToken()) {
  return token.length >= 12;
}

function parseAdminSessionValue(sessionValue) {
  const [version, expiresAtValue, signature, ...extra] = String(sessionValue ?? "").split(".");
  const expiresAt = Number(expiresAtValue);

  if (
    extra.length > 0 ||
    version !== ADMIN_SESSION_VERSION ||
    !Number.isSafeInteger(expiresAt) ||
    !/^[a-f0-9]{64}$/i.test(signature ?? "")
  ) {
    return null;
  }

  return {
    expiresAt,
    signature: signature.toLowerCase(),
    version
  };
}

function toHex(buffer) {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(left, right) {
  if (!left || !right || left.length !== right.length) {
    return false;
  }

  let difference = 0;

  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }

  return difference === 0;
}

async function signAdminSessionPayload(payload, token) {
  const key = await globalThis.crypto.subtle.importKey(
    "raw",
    encoder.encode(token),
    {
      hash: "SHA-256",
      name: "HMAC"
    },
    false,
    ["sign"]
  );
  const signature = await globalThis.crypto.subtle.sign("HMAC", key, encoder.encode(payload));

  return toHex(signature);
}

export async function isAdminSessionValueValidAtEdge(
  sessionValue,
  { now = Date.now(), token = getConfiguredAdminToken() } = {}
) {
  if (!isAdminTokenValueConfigured(token)) {
    return false;
  }

  const parsed = parseAdminSessionValue(sessionValue);

  if (!parsed || parsed.expiresAt <= now) {
    return false;
  }

  const expectedSignature = await signAdminSessionPayload(
    `${parsed.version}.${parsed.expiresAt}`,
    token
  );

  return constantTimeEqual(parsed.signature, expectedSignature);
}

export function getAdminSessionCookieOptions({ maxAge = ADMIN_SESSION_MAX_AGE_SECONDS } = {}) {
  return {
    httpOnly: true,
    maxAge,
    path: "/admin",
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production"
  };
}
