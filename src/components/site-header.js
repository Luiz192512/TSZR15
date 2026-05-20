import Link from "next/link";

export function SiteHeader({ user } = {}) {
  return (
    <header className="site-header">
      <Link className="brand-mark" href="/">
        <span className="brand-badge">R15</span>
        <span className="brand-copy">
          <strong>TSZR15</strong>
          <span>Loja R15 com compra assistida</span>
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
        {user ? (
          <Link className="nav-link nav-link-auth" href="/conta">
            Minha conta
          </Link>
        ) : (
          <Link className="nav-link nav-link-auth" href="/entrar">
            Entrar
          </Link>
        )}
      </nav>
    </header>
  );
}
