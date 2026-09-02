import globalStyles from "@/app/storefront.module.css";
import { cx } from "@/src/lib/classnames";
import Image from "next/image";
import Link from "next/link";

import { AccountNavLink } from "@/src/components/account-nav-link.js";
import { CartIcon } from "@/src/components/cart-icon.js";
import { CartCountBadge } from "@/src/components/cart-count-badge.js";
import { ThemeToggle } from "@/src/components/theme/theme-toggle.js";

export function SiteHeader({ showAccountNav = true, user } = {}) {
  return (
    <header className={cx(globalStyles, "store-header store-header-compact")}>
      <div className={cx(globalStyles, "store-header-top")}>
        <Link className={cx(globalStyles, "store-brand")} href="/">
          <Image
            alt="TSZ Store"
            className={cx(globalStyles, "store-logo-image")}
            height={2000}
            sizes="154px"
            src="/brand/logo-tszr15-store.webp"
            width={2000}
          />
          <span>
            <strong>TSZR15</strong>
            <small>Performance parts R15</small>
          </span>
        </Link>

        <div className={cx(globalStyles, "mobile-nav-actions")}>
          <ThemeToggle />
          <Link
            aria-label="Carrinho - abrir pedido"
            className={cx(globalStyles, "cart-nav-link mobile-cart-link")}
            href="/pedido"
          >
            <CartIcon />
            <span className={cx(globalStyles, "sr-only")}>Carrinho</span>
            <CartCountBadge userId={user?.id} />
          </Link>
          <details className={cx(globalStyles, "mobile-nav-details")}>
            <summary
              className={cx(globalStyles, "mobile-menu-button")}
              aria-label="Abrir menu da loja"
            >
              Menu
              <span aria-hidden="true" className={cx(globalStyles, "mobile-menu-icon")} />
            </summary>
            <nav className={cx(globalStyles, "mobile-nav-panel")} aria-label="Menu mobile da loja">
              <Link href="/">Início</Link>
              <Link href="/catalogo">Produtos</Link>
              <Link href="/#lancamentos">Lançamentos</Link>
              <Link href="/rastreio">Rastreio</Link>
              {showAccountNav ? (
                <AccountNavLink
                  authenticatedClassName=""
                  unauthenticatedClassName=""
                  user={user}
                  variant="text"
                />
              ) : null}
            </nav>
          </details>
        </div>
      </div>

      <nav className={cx(globalStyles, "store-nav")} aria-label="Navegação principal">
        <Link href="/">Início</Link>
        <Link href="/catalogo">Produtos</Link>
        <Link href="/#lancamentos">Lançamentos</Link>
        <Link
          aria-label="Carrinho - abrir pedido"
          className={cx(globalStyles, "cart-nav-link")}
          href="/pedido"
        >
          <CartIcon />
          <span className={cx(globalStyles, "sr-only")}>Carrinho</span>
          <CartCountBadge userId={user?.id} />
        </Link>
        <Link href="/rastreio">Rastreio</Link>
        {showAccountNav ? (
          <AccountNavLink
            authenticatedClassName="profile-link store-profile-link desktop-account-link"
            unauthenticatedClassName="button button-secondary"
            user={user}
          />
        ) : null}
        <ThemeToggle />
      </nav>
    </header>
  );
}
