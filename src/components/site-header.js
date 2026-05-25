import Link from "next/link";

import { ProfileLink } from "@/src/components/profile-link.js";

export function SiteHeader({ user } = {}) {
  return (
    <header className="site-header">
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

      <nav className="nav-links">
        <Link className="nav-link" href="/">
          Inicio
        </Link>
        <Link className="nav-link" href="/catalogo">
          Produtos
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
