import { createHash, createHmac, timingSafeEqual } from "crypto";

import {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_MAX_AGE_SECONDS,
  ADMIN_SESSION_VERSION
} from "./admin-session-constants.js";

export { ADMIN_SESSION_COOKIE, ADMIN_SESSION_MAX_AGE_SECONDS };

export function getConfiguredAdminToken() {
  return process.env.TSZR15_ADMIN_TOKEN ?? "";
}

export function isAdminTokenValueConfigured(token = getConfiguredAdminToken()) {
  return token.length >= 12;
}

function hashValue(value) {
  return createHash("sha256").update(String(value ?? "")).digest("hex");
}

function signAdminSessionPayload(payload, token) {
  return createHmac("sha256", token).update(payload).digest("hex");
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
    signature,
    version
  };
}

function safeEqual(left, right) {
  if (!left || !right || left.length !== right.length) {
    return false;
  }

  return timingSafeEqual(Buffer.from(left), Buffer.from(right));
}

export function isAdminPasswordValid(candidateToken, configuredToken = getConfiguredAdminToken()) {
  if (!isAdminTokenValueConfigured(configuredToken)) {
    return false;
  }

  return safeEqual(hashValue(candidateToken), hashValue(configuredToken));
}

export function createAdminSessionValue({
  now = Date.now(),
  token = getConfiguredAdminToken()
} = {}) {
  if (!isAdminTokenValueConfigured(token)) {
    return "";
  }

  const expiresAt = now + ADMIN_SESSION_MAX_AGE_SECONDS * 1000;
  const payload = `${ADMIN_SESSION_VERSION}.${expiresAt}`;
  const signature = signAdminSessionPayload(payload, token);

  return `${payload}.${signature}`;
}

export function isAdminSessionValueValid(
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

  const expectedSignature = signAdminSessionPayload(
    `${parsed.version}.${parsed.expiresAt}`,
    token
  );

  return safeEqual(parsed.signature, expectedSignature);
}

export function isAdminSessionValueFreshShape(sessionValue, { now = Date.now() } = {}) {
  const parsed = parseAdminSessionValue(sessionValue);

  return Boolean(parsed && parsed.expiresAt > now);
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
