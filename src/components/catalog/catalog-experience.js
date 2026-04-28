"use client";

import Link from "next/link";
import { startTransition, useDeferredValue, useState } from "react";

import { formatCategoryLabels } from "@/src/catalog/index.js";

export function CatalogExperience({ categories, products, title, description }) {
  const [activeCategory, setActiveCategory] = useState("all");
  const [query, setQuery] = useState("");
  const [only3D, setOnly3D] = useState(false);
  const deferredQuery = useDeferredValue(query);
  const normalizedQuery = deferredQuery.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

  const visibleProducts = products.filter((product) => {
    const matchesCategory =
      activeCategory === "all" || product.storefrontCategoryIds.includes(activeCategory);
    const matches3D = !only3D || product.is3DEligible;
    const searchable = `${product.name} ${product.productFamily}`
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase();
    const matchesQuery = normalizedQuery.length === 0 || searchable.includes(normalizedQuery);

    return matchesCategory && matches3D && matchesQuery;
  });

  return (
    <section className="surface-panel" id="catalogo">
      <div className="section-heading">
        <div>
          <p className="section-label">Vitrine</p>
          <h2>{title}</h2>
        </div>
        <p className="helper-text">{description}</p>
      </div>

      <div className="catalog-controls">
        <label className="search-box" htmlFor="catalog-search">
          <input
            id="catalog-search"
            placeholder="Buscar por nome, familia ou tipo de acessorio"
            value={query}
            onChange={(event) => {
              const nextValue = event.target.value;
              startTransition(() => setQuery(nextValue));
            }}
          />
        </label>

        <label className="toggle-row" htmlFor="catalog-only-3d">
          <input
            id="catalog-only-3d"
            type="checkbox"
            checked={only3D}
            onChange={(event) => {
              const nextChecked = event.target.checked;
              startTransition(() => setOnly3D(nextChecked));
            }}
          />
          <span>Somente itens prontos para 3D</span>
        </label>
      </div>

      <div className="filter-pills">
        <button
          className={`pill-button ${activeCategory === "all" ? "is-active" : ""}`}
          onClick={() => startTransition(() => setActiveCategory("all"))}
          type="button"
        >
          Todos ({products.length})
        </button>
        {categories.map((category) => (
          <button
            className={`pill-button ${activeCategory === category.id ? "is-active" : ""}`}
            key={category.id}
            onClick={() => startTransition(() => setActiveCategory(category.id))}
            type="button"
          >
            {category.label} ({category.productCount})
          </button>
        ))}
      </div>

      <p className="filter-summary">
        Exibindo <strong>{visibleProducts.length}</strong> produtos do catalogo curado da R15.
      </p>

      {visibleProducts.length === 0 ? (
        <div className="empty-state">
          <p className="empty-copy">
            Nenhum item bateu com esse filtro. Tente limpar a busca ou abrir todos os
            produtos para continuar.
          </p>
        </div>
      ) : (
        <div className="catalog-grid">
          {visibleProducts.map((product) => (
            <article className="catalog-card" key={product.id}>
              <div className="badge-row">
                {formatCategoryLabels(product.storefrontCategoryIds).map((label) => (
                  <span className="badge badge-category" key={`${product.id}-${label}`}>
                    {label}
                  </span>
                ))}
                <span className="badge badge-family">{product.productFamily}</span>
                {product.is3DEligible ? <span className="badge badge-3d">3D</span> : null}
              </div>

              <h3>{product.name}</h3>

              <div className="catalog-meta">
                <span>
                  <strong>Escopo:</strong> {product.bikeModelScope.join(", ")}
                </span>
                <span>
                  <strong>Slot:</strong> {product.renderSlot ?? "fora do configurador"}
                </span>
                <span>
                  <strong>Fornecedor:</strong> {product.supplierSource.provider}
                </span>
              </div>

              {product.is3DEligible ? (
                <Link className="button button-secondary" href="/configurador">
                  Visualizar no configurador
                </Link>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
