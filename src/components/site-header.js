import Link from "next/link";

import { CartCountBadge } from "@/src/components/cart-count-badge.js";
import { ProfileLink } from "@/src/components/profile-link.js";

export function SiteHeader({ user } = {}) {
  return (
    <header className="site-header">
      <div className="site-header-top">
        <Link className="brand-mark" href="/">
          <img
            alt="TSZ Store"
            className="brand-logo-image"
            src="/brand/logo-tszr15-store.png"
          />
          <span className="brand-copy">
            <strong>TSZR15</strong>
            <span>Performance parts R15</span>
          </span>
        </Link>

        <div className="mobile-nav-actions">
          <Link className="cart-nav-link mobile-cart-link" href="/pedido">
            Carrinho
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
              {user ? <Link href="/conta">Conta</Link> : <Link href="/entrar">Entrar</Link>}
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
        <Link className="nav-link" href="/pedido">
          Carrinho
        </Link>
        <Link className="nav-link" href="/rastreio">
          Rastreio
        </Link>
        {user ? (
          <ProfileLink user={user} />
        ) : (
          <Link className="nav-link nav-link-auth" href="/entrar">
            Entrar
          </Link>
        )}
      </nav>
    </header>
  );
}
