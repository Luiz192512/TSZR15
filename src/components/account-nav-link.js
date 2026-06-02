"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { getUserInitials } from "@/src/auth/user-display.js";
import { createBrowserSupabaseClient } from "@/src/lib/supabase/client.js";

async function getHeaderSessionUser() {
  try {
    const response = await fetch("/api/auth/me", {
      cache: "no-store",
      credentials: "same-origin"
    });

    if (!response.ok) {
      return null;
    }

    const payload = await response.json();

    return payload.authenticated ? payload.user : null;
  } catch {
    return null;
  }
}

export function AccountNavLink({
  authenticatedClassName = "profile-link",
  unauthenticatedClassName = "nav-link nav-link-auth",
  user,
  variant = "icon"
}) {
  const [currentUser, setCurrentUser] = useState(user ?? null);
  const [hasCheckedSession, setHasCheckedSession] = useState(Boolean(user));

  useEffect(() => {
    if (user) {
      setCurrentUser(user);
      setHasCheckedSession(true);
      return undefined;
    }

    const supabase = createBrowserSupabaseClient();

    if (!supabase) {
      let isMounted = true;

      getHeaderSessionUser().then((sessionUser) => {
        if (isMounted) {
          setCurrentUser(sessionUser);
          setHasCheckedSession(true);
        }
      });

      return () => {
        isMounted = false;
      };
    }

    let isMounted = true;

    supabase.auth
      .getUser()
      .then(async ({ data }) => {
        const sessionUser = data.user ?? (await getHeaderSessionUser());

        if (isMounted) {
          setCurrentUser(sessionUser);
          setHasCheckedSession(true);
        }
      })
      .catch(async () => {
        const sessionUser = await getHeaderSessionUser();

        if (isMounted) {
          setCurrentUser(sessionUser);
          setHasCheckedSession(true);
        }
      });

    getHeaderSessionUser().then((sessionUser) => {
      if (isMounted && sessionUser) {
        setCurrentUser(sessionUser);
        setHasCheckedSession(true);
      }
    });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user || event === "SIGNED_OUT") {
        setCurrentUser(session?.user ?? null);
        setHasCheckedSession(true);
        return;
      }

      getHeaderSessionUser().then((sessionUser) => {
        if (isMounted) {
          setCurrentUser(sessionUser);
          setHasCheckedSession(true);
        }
      });
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [user]);

  if (currentUser) {
    if (variant === "text") {
      return (
        <Link className={authenticatedClassName} href="/conta">
          Conta
        </Link>
      );
    }

    return (
      <Link
        aria-label="Acessar perfil"
        className={authenticatedClassName}
        href="/conta"
        title="Minha conta"
      >
        <span aria-hidden="true" className="profile-link-icon">
          {getUserInitials(currentUser)}
        </span>
      </Link>
    );
  }

  if (!hasCheckedSession) {
    return (
      <Link
        className={authenticatedClassName || unauthenticatedClassName}
        data-auth-loading="true"
        href="/conta"
      >
        {variant === "text" ? (
          "Conta"
        ) : (
          <span aria-hidden="true" className="profile-link-icon">
            C
          </span>
        )}
      </Link>
    );
  }

  return (
    <Link
      className={unauthenticatedClassName}
      data-auth-loading={hasCheckedSession ? "false" : "true"}
      href="/entrar"
    >
      Entrar
    </Link>
  );
}
