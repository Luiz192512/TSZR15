"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cx } from "@/src/lib/classnames";
import { useCartCount } from "@/src/components/catalog/catalog-shared.js";
import styles from "./mobile-tab-bar.module.css";

function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M3 11l9-8 9 8" />
      <path d="M5 10v10h14V10" />
    </svg>
  );
}

function GridIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}

function CartGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M6 6h15l-1.5 9h-12z" />
      <circle cx="9" cy="20" r="1.4" />
      <circle cx="18" cy="20" r="1.4" />
      <path d="M6 6 5 3H3" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" />
    </svg>
  );
}

const TABS = [
  { href: "/", label: "Início", Icon: HomeIcon, match: (p) => p === "/" },
  {
    href: "/catalogo",
    label: "Catálogo",
    Icon: GridIcon,
    match: (p) => p.startsWith("/catalogo") || p.startsWith("/produto")
  },
  {
    href: "/pedido",
    label: "Carrinho",
    Icon: CartGlyph,
    badge: true,
    match: (p) => p.startsWith("/pedido")
  },
  {
    href: "/conta",
    label: "Conta",
    Icon: UserIcon,
    match: (p) => p.startsWith("/conta") || p.startsWith("/entrar") || p.startsWith("/cadastrar")
  }
];

export function MobileTabBar() {
  const pathname = usePathname() || "/";
  const cartCount = useCartCount();

  return (
    <nav className={cx(styles, "bar")} aria-label="Navegação principal">
      {TABS.map(({ href, label, Icon, badge, match }) => {
        const active = match(pathname);

        return (
          <Link
            key={href}
            href={href}
            className={cx(styles, active ? "tab active" : "tab")}
            aria-current={active ? "page" : undefined}
          >
            <span className={cx(styles, "ico")}>
              <Icon />
              {badge && cartCount > 0 ? <span className={cx(styles, "badge")}>{cartCount}</span> : null}
            </span>
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
