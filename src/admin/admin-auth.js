import "server-only";

import { cookies } from "next/headers";

import {
  ADMIN_SESSION_COOKIE,
  createAdminSessionValue,
  getAdminSessionCookieOptions,
  isAdminPasswordValid,
  isAdminSessionValueValid,
  isAdminTokenValueConfigured
} from "./admin-session.js";

export function isAdminTokenConfigured() {
  return isAdminTokenValueConfigured();
}

export async function isAdminSessionValid() {
  if (!isAdminTokenConfigured()) {
    return false;
  }

  const cookieStore = await cookies();
  const sessionValue = cookieStore.get(ADMIN_SESSION_COOKIE)?.value ?? "";

  return isAdminSessionValueValid(sessionValue);
}

export async function startAdminSession(token) {
  if (!isAdminPasswordValid(token)) {
    return false;
  }

  const cookieStore = await cookies();
  cookieStore.set(
    ADMIN_SESSION_COOKIE,
    createAdminSessionValue(),
    getAdminSessionCookieOptions()
  );

  return true;
}

export async function clearAdminSession() {
  const cookieStore = await cookies();
  cookieStore.set(ADMIN_SESSION_COOKIE, "", getAdminSessionCookieOptions({ maxAge: 0 }));
}
