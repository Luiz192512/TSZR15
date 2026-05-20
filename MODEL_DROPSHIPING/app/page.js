import Link from "next/link";

import { CatalogExperience } from "@/src/components/catalog/catalog-experience.js";
import { SiteHeader } from "@/src/components/site-header.js";
import {
  catalogProducts,
  getCatalogStats,
  getStorefrontMenu
} from "@/src/catalog/index.js";

export default function HomePage() {
  const stats = getCatalogStats();
  const menu = getStorefrontMenu();

  return (
    <main className="page-shell">
      <SiteHeader />

      <section className="hero-panel">
        <div className="hero-copy">
          <p className="eyebrow">Catalogo Yamaha R15</p>
          <h1>Base real de loja em Next.js com filtro comercial e inicio do configurador 3D.</h1>
          <p className="lead">
            Esta versao organiza o catalogo aprovado da R15, destaca os produtos prontos para
            o configurador e ja prepara a experiencia para checkout e compatibilidade no
            proximo ciclo.
          </p>
          <div className="hero-actions">
            <Link className="button button-primary" href="/configurador">
              Abrir configurador 3D
            </Link>
            <a className="button button-secondary" href="#catalogo">
              Ver catalogo
            </a>
          </div>
        </div>

        <aside className="hero-summary">
          <p className="section-label">Resumo rapido</p>
          <div className="stats-grid">
            {stats.map((stat) => (
              <article className="stat-card" key={stat.label}>
                <span className="stat-value">{stat.value}</span>
                <span className="stat-label">{stat.label}</span>
              </article>
            ))}
          </div>
          <div className="menu-preview">
            {menu.map((category) => (
              <span className="menu-chip" key={category.id}>
                {category.label}
              </span>
            ))}
          </div>
        </aside>
      </section>

      <CatalogExperience
        categories={menu}
        products={catalogProducts}
        title="Catalogo publicado"
        description="Filtre por categoria, busque por nome e destaque os itens ja elegiveis para o configurador 3D."
      />
    </main>
  );
}
