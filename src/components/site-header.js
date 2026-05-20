import Link from "next/link";

export function SiteHeader({ compact = false }) {
  return (
    <header className="site-header">
      <Link className="brand-mark" href="/">
        <span className="brand-badge">R15</span>
        <span className="brand-copy">
          <strong>TSZR15</strong>
          <span>{compact ? "Catalogo + 3D" : "Catalogo curado e configurador inicial"}</span>
        </span>
      </Link>

      <nav className="nav-links">
        <Link className="nav-link" href="/">
          Catalogo
        </Link>
        <Link className="nav-link" href="/configurador">
          Configurador 3D
        </Link>
        <a className="nav-link nav-link-muted" href="/api/catalog">
          API Catalogo
        </a>
      </nav>
    </header>
  );
}
