"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { getUserInitials } from "@/src/auth/user-display.js";
import { createBrowserSupabaseClient } from "@/src/lib/supabase/client.js";

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
      setHasCheckedSession(true);
      return undefined;
    }

    let isMounted = true;

    supabase.auth.getUser().then(({ data }) => {
      if (isMounted) {
        setCurrentUser(data.user ?? null);
        setHasCheckedSession(true);
      }
    });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setCurrentUser(session?.user ?? null);
      setHasCheckedSession(true);
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
