import { isPreviewTarget, readEnvValue } from "../lib/runtime-target.js";

import {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_MAX_AGE_SECONDS,
  ADMIN_SESSION_VERSION,
  ADMIN_TOKEN_MIN_LENGTH
} from "./admin-session-constants.js";

export { ADMIN_SESSION_COOKIE, ADMIN_SESSION_MAX_AGE_SECONDS };

const encoder = new TextEncoder();

/**
 * Token do admin, por ambiente.
 *
 * Mesma regra do Supabase e do Mercado Pago: o NOME da variavel declara o
 * ambiente, e nao ha fallback entre os dois conjuntos. Staging sem o proprio
 * token fica com o admin DESLIGADO — nunca cai no token da loja no ar, que
 * abriria o painel de producao para quem tivesse acesso ao staging.
 */
function getConfiguredAdminToken() {
  return readEnvValue(isPreviewTarget() ? "TSZR15_PREVIEW_ADMIN_TOKEN" : "TSZR15_ADMIN_TOKEN");
}

export function isAdminTokenValueConfiguredAtEdge(token = getConfiguredAdminToken()) {
  return token.length >= ADMIN_TOKEN_MIN_LENGTH;
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
  if (!isAdminTokenValueConfiguredAtEdge(token)) {
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

export function isAdminSessionValueFreshShapeAtEdge(sessionValue, { now = Date.now() } = {}) {
  const parsed = parseAdminSessionValue(sessionValue);

  return Boolean(parsed && parsed.expiresAt > now);
}

export function getAdminSessionCookieOptions({ maxAge = ADMIN_SESSION_MAX_AGE_SECONDS } = {}) {
  return {
    httpOnly: true,
    maxAge,
    path: "/admin",
    sameSite: "strict",
    secure: true
  };
}
