import "server-only";

import { createHash, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

const ADMIN_SESSION_COOKIE = "tszr15_admin_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8;

function getConfiguredAdminToken() {
  return process.env.TSZR15_ADMIN_TOKEN ?? "";
}

function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

function safeEqual(left, right) {
  if (!left || !right || left.length !== right.length) {
    return false;
  }

  return timingSafeEqual(Buffer.from(left), Buffer.from(right));
}

export function isAdminTokenConfigured() {
  return getConfiguredAdminToken().length >= 12;
}

export async function isAdminSessionValid() {
  if (!isAdminTokenConfigured()) {
    return false;
  }

  const cookieStore = await cookies();
  const sessionValue = cookieStore.get(ADMIN_SESSION_COOKIE)?.value ?? "";

  return safeEqual(sessionValue, hashToken(getConfiguredAdminToken()));
}

export async function startAdminSession(token) {
  if (!isAdminTokenConfigured() || !safeEqual(hashToken(token), hashToken(getConfiguredAdminToken()))) {
    return false;
  }

  const cookieStore = await cookies();
  cookieStore.set(ADMIN_SESSION_COOKIE, hashToken(token), {
    httpOnly: true,
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: "/admin",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production"
  });

  return true;
}

export async function clearAdminSession() {
  const cookieStore = await cookies();
  cookieStore.set(ADMIN_SESSION_COOKIE, "", {
    httpOnly: true,
    maxAge: 0,
    path: "/admin",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production"
  });
}
