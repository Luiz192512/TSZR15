import Link from "next/link";

import { AccountNavLink } from "@/src/components/account-nav-link.js";
import { CartIcon } from "@/src/components/cart-icon.js";
import { CartCountBadge } from "@/src/components/cart-count-badge.js";

export function SiteHeader({ user } = {}) {
  return (
    <header className="site-header">
      <div className="site-header-top">
        <Link className="brand-mark" href="/">
          <img alt="TSZ Store" className="brand-logo-image" src="/brand/logo-tszr15-store.png" />
          <span className="brand-copy">
            <strong>TSZR15</strong>
            <span>Performance parts R15</span>
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
            <summary className="mobile-menu-button">
              Menu
              <span aria-hidden="true" className="mobile-menu-icon" />
            </summary>
            <nav className="mobile-nav-panel" aria-label="Menu mobile">
              <Link href="/">Inicio</Link>
              <Link href="/catalogo#produtos">Produtos</Link>
              <Link href="/#lancamentos">Lancamentos</Link>
              <Link href="/#sobre">Sobre nos</Link>
              <Link href="/rastreio">Rastreio</Link>
              <AccountNavLink
                authenticatedClassName=""
                unauthenticatedClassName=""
                user={user}
                variant="text"
              />
            </nav>
          </details>
        </div>
      </div>

      <nav className="nav-links">
        <Link className="nav-link" href="/">
          Inicio
        </Link>
        <Link className="nav-link" href="/catalogo#produtos">
          Produtos
        </Link>
        <Link className="nav-link" href="/#sobre">
          Sobre nos
        </Link>
        <Link aria-label="Abrir carrinho" className="nav-link cart-nav-link" href="/pedido">
          <CartIcon />
          <span className="sr-only">Carrinho</span>
          <CartCountBadge />
        </Link>
        <Link className="nav-link" href="/rastreio">
          Rastreio
        </Link>
        <AccountNavLink user={user} />
      </nav>
    </header>
  );
}
