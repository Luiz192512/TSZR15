import Link from "next/link";

import { ConfiguratorWorkbench } from "@/src/components/configurator/configurator-workbench.js";
import { SiteHeader } from "@/src/components/site-header.js";
import {
  getCatalogStats,
  groupConfiguratorProductsBySlot
} from "@/src/catalog/index.js";

export default function ConfiguratorPage() {
  const slotGroups = groupConfiguratorProductsBySlot();
  const stats = getCatalogStats();

  return (
    <main className="page-shell">
      <SiteHeader compact />

      <section className="hero-panel hero-panel-compact">
        <div className="hero-copy">
          <p className="eyebrow">Configurador 3D</p>
          <h1>Primeiro viewer interativo da R15 para validar slots, familias e selecao.</h1>
          <p className="lead">
            Esta tela ja conecta o catalogo ao configurador. Cada slot mostra os produtos
            aprovados para a R15 e atualiza a cena 3D em tempo real.
          </p>
          <div className="hero-actions">
            <Link className="button button-primary" href="/">
              Voltar ao catalogo
            </Link>
          </div>
        </div>

        <aside className="hero-summary">
          <p className="section-label">Estado atual</p>
          <div className="stats-grid">
            {stats.slice(0, 3).map((stat) => (
              <article className="stat-card" key={stat.label}>
                <span className="stat-value">{stat.value}</span>
                <span className="stat-label">{stat.label}</span>
              </article>
            ))}
          </div>
          <p className="support-copy">
            O viewer atual usa geometria base para representar os slots. O proximo passo sera
            trocar essas pecas por assets GLB da R15 e dos acessorios.
          </p>
        </aside>
      </section>

      <ConfiguratorWorkbench slotGroups={slotGroups} />
    </main>
  );
}
