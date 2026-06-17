import Image from "next/image";
import Link from "next/link";

import { AccountNavLink } from "@/src/components/account-nav-link.js";
import { CartIcon } from "@/src/components/cart-icon.js";
import { CartCountBadge } from "@/src/components/cart-count-badge.js";

export function SiteHeader({ showAccountNav = true, user } = {}) {
  return (
    <header className="store-header store-header-compact">
      <div className="store-header-top">
        <Link className="store-brand" href="/">
          <Image
            alt="TSZ Store"
            className="store-logo-image"
            height={2000}
            sizes="154px"
            src="/brand/logo-tszr15-store.png"
            width={2000}
          />
          <span>
            <strong>TSZR15</strong>
            <small>Performance parts R15</small>
          </span>
        </Link>

        <div className="mobile-nav-actions">
          <Link
            aria-label="Abrir carrinho"
            className="cart-nav-link mobile-cart-link"
            href="/pedido"
          >
            <CartIcon />
            <span className="sr-only">Carrinho</span>
            <CartCountBadge />
          </Link>
          <details className="mobile-nav-details">
            <summary className="mobile-menu-button" aria-label="Abrir menu da loja">
              Menu
              <span aria-hidden="true" className="mobile-menu-icon" />
            </summary>
            <nav className="mobile-nav-panel" aria-label="Menu mobile da loja">
              <Link href="/">Inicio</Link>
              <Link href="/catalogo#produtos">Produtos</Link>
              <Link href="/#lancamentos">Lancamentos</Link>
              <Link href="/#sobre">Sobre nos</Link>
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

      <nav className="store-nav" aria-label="Navegacao principal">
        <Link href="/">Inicio</Link>
        <Link href="/catalogo#produtos">Produtos</Link>
        <Link href="/#lancamentos">Lancamentos</Link>
        <Link href="/#sobre">Sobre nos</Link>
        <Link aria-label="Abrir carrinho" className="cart-nav-link" href="/pedido">
          <CartIcon />
          <span className="sr-only">Carrinho</span>
          <CartCountBadge />
        </Link>
        <Link href="/rastreio">Rastreio</Link>
        {showAccountNav ? (
          <AccountNavLink
            authenticatedClassName="profile-link store-profile-link desktop-account-link"
            unauthenticatedClassName="button button-secondary"
            user={user}
          />
        ) : null}
      </nav>
    </header>
  );
}
