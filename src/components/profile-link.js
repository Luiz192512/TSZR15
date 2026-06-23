import globalStyles from "@/src/styles/storefront-styles.js";
import { cx } from "@/src/lib/classnames";
import Link from "next/link";

import { getUserDisplayName, getUserInitials } from "@/src/auth/user-display.js";

export function ProfileLink({ className = "", user }) {
  const displayName = getUserDisplayName(user);
  const label = displayName ? `Acessar perfil de ${displayName}` : "Acessar perfil";

  return (
    <Link
      aria-label={label}
      className={cx(globalStyles, `profile-link ${className}`.trim())}
      href="/conta"
      title="Minha conta"
    >
      <span aria-hidden="true" className={cx(globalStyles, "profile-link-icon")}>
        {getUserInitials(user)}
      </span>
    </Link>
  );
}
