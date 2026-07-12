"use client";

import globalStyles from "@/app/storefront.module.css";
import { cx } from "@/src/lib/classnames";
import { startTransition, useDeferredValue, useEffect, useMemo, useState } from "react";

import { getVariationSwatchColor } from "@/src/catalog/variation-images.js";
import { normalizeSearch, ProductCard } from "./catalog-shared.js";
import styles from "./catalog-browser.module.css";

const sortOptions = [
  ["relevancia", "Relevância"],
  ["menor-preco", "Menor preço"],
  ["maior-preco", "Maior preço"],
  ["nome", "Nome A-Z"]
];

const priceOptions = [
  ["todos", "Qualquer preço"],
  ["ate-150", "Até R$ 150"],
  ["150-300", "R$ 150 a R$ 300"],
  ["300-mais", "Acima de R$ 300"]
];

// Opcoes de cor derivadas das variacoes reais dos produtos: so variacoes com
// cor mapeada (getVariationSwatchColor) viram filtro, agrupadas por tom (hex).
function getColorOptions(products) {
  const byHex = new Map();

  for (const product of products) {
    for (const variation of product.variations ?? []) {
      const hex = getVariationSwatchColor(variation);

      if (hex && !byHex.has(hex)) {
        byHex.set(hex, { hex, label: variation });
      }
    }
  }

  return [...byHex.values()];
}

function matchesColors(product, selectedColors) {
  if (selectedColors.length === 0) {
    return true;
  }

  return (product.variations ?? []).some((variation) =>
    selectedColors.includes(getVariationSwatchColor(variation))
  );
}

function matchesPriceRange(product, priceRange) {
  if (priceRange === "ate-150") {
    return product.priceCents <= 15000;
  }

  if (priceRange === "150-300") {
    return product.priceCents > 15000 && product.priceCents <= 30000;
  }

  if (priceRange === "300-mais") {
    return product.priceCents > 30000;
  }

  return true;
}

function sortProducts(products, sort) {
  if (sort === "menor-preco") {
    return [...products].sort((a, b) => a.priceCents - b.priceCents);
  }

  if (sort === "maior-preco") {
    return [...products].sort((a, b) => b.priceCents - a.priceCents);
  }

  if (sort === "nome") {
    return [...products].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }

  return products;
}

function SlidersIcon() {
  return (
    <svg aria-hidden="true" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h13M21 18h-1" />
      <circle cx="16" cy="6" r="2" />
      <circle cx="10" cy="12" r="2" />
      <circle cx="19" cy="18" r="2" />
    </svg>
  );
}

export function CatalogBrowser({ categories, products }) {
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");
  const [sort, setSort] = useState("relevancia");
  const [priceRange, setPriceRange] = useState("todos");
  const [selectedColors, setSelectedColors] = useState([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const deferredQuery = useDeferredValue(query);
  const normalizedQuery = normalizeSearch(deferredQuery);

  const colorOptions = useMemo(() => getColorOptions(products), [products]);

  const visibleProducts = useMemo(() => {
    const filtered = products.filter((product) => {
      const searchable = normalizeSearch(`${product.name} ${product.productFamily}`);
      const matchesQuery = normalizedQuery.length === 0 || searchable.includes(normalizedQuery);
      const matchesCategory =
        activeCategory === "all" || product.storefrontCategoryIds.includes(activeCategory);

      return (
        matchesQuery &&
        matchesCategory &&
        matchesPriceRange(product, priceRange) &&
        matchesColors(product, selectedColors)
      );
    });

    return sortProducts(filtered, sort);
  }, [products, normalizedQuery, activeCategory, priceRange, selectedColors, sort]);

  const availableCategories = categories.filter((category) => category.productCount > 0);
  const activeFilterCount =
    (sort !== "relevancia" ? 1 : 0) + (priceRange !== "todos" ? 1 : 0) + selectedColors.length;

  useEffect(() => {
    if (!filtersOpen) {
      return undefined;
    }

    function onKeyDown(event) {
      if (event.key === "Escape") {
        setFiltersOpen(false);
      }
    }

    window.addEventListener("keydown", onKeyDown);

    return () => window.removeEventListener("keydown", onKeyDown);
  }, [filtersOpen]);

  function toggleColor(hex) {
    startTransition(() =>
      setSelectedColors((current) =>
        current.includes(hex) ? current.filter((item) => item !== hex) : [...current, hex]
      )
    );
  }

  function clearFilters() {
    startTransition(() => {
      setSort("relevancia");
      setPriceRange("todos");
      setSelectedColors([]);
    });
  }

  return (
    <section className={cx(styles, "browser")}>
      <header className={cx(styles, "head")}>
        <p className={cx(globalStyles, "section-label")}>Catálogo R15</p>
        <h1>Todos os produtos</h1>
      </header>

      <label className={cx(globalStyles, "store-search")} htmlFor="catalog-browser-search">
        <span>Buscar</span>
        <input
          id="catalog-browser-search"
          onChange={(event) => {
            const value = event.target.value;

            startTransition(() => setQuery(value));
          }}
          placeholder="Escapamentos, sliders, manetes..."
          value={query}
        />
      </label>

      <nav className={cx(globalStyles, "category-strip")} aria-label="Categorias">
        <button
          className={cx(
            globalStyles,
            `category-token ${activeCategory === "all" ? "is-active" : ""}`
          )}
          onClick={() => startTransition(() => setActiveCategory("all"))}
          type="button"
        >
          <span>{products.length}</span>
          Todos
        </button>
        {availableCategories.map((category) => (
          <button
            className={cx(
              globalStyles,
              `category-token ${activeCategory === category.id ? "is-active" : ""}`
            )}
            key={category.id}
            onClick={() => startTransition(() => setActiveCategory(category.id))}
            type="button"
          >
            <span>{category.productCount}</span>
            {category.label}
          </button>
        ))}
      </nav>

      <div className={cx(styles, "toolbar")}>
        <button
          aria-expanded={filtersOpen}
          className={cx(styles, "filterBtn")}
          onClick={() => setFiltersOpen(true)}
          type="button"
        >
          <SlidersIcon />
          Filtro
          {activeFilterCount > 0 ? (
            <span className={cx(styles, "filterBadge")}>{activeFilterCount}</span>
          ) : null}
        </button>
        <span aria-live="polite" className={cx(styles, "count")}>
          {visibleProducts.length} {visibleProducts.length === 1 ? "produto" : "produtos"}
        </span>
      </div>

      {filtersOpen ? (
        <>
          <button
            aria-label="Fechar filtros"
            className={cx(styles, "backdrop")}
            onClick={() => setFiltersOpen(false)}
            type="button"
          />
          <div aria-label="Filtros" className={cx(styles, "sheet")} role="dialog">
            <header className={cx(styles, "sheetHead")}>
              <strong>Filtros</strong>
              <button
                aria-label="Fechar"
                className={cx(styles, "sheetClose")}
                onClick={() => setFiltersOpen(false)}
                type="button"
              >
                <svg aria-hidden="true" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2" viewBox="0 0 24 24">
                  <path d="m6 6 12 12M18 6 6 18" />
                </svg>
              </button>
            </header>

            <div className={cx(styles, "sheetBody")}>
              <p className={cx(styles, "groupLabel")}>Ordenar por</p>
              <div className={cx(styles, "chipRow")} role="group" aria-label="Ordenar por">
                {sortOptions.map(([value, label]) => (
                  <button
                    aria-pressed={sort === value}
                    className={cx(styles, sort === value ? "optChip optChipActive" : "optChip")}
                    key={value}
                    onClick={() => startTransition(() => setSort(value))}
                    type="button"
                  >
                    {label}
                  </button>
                ))}
              </div>

              <p className={cx(styles, "groupLabel")}>Preço</p>
              <div className={cx(styles, "chipRow")} role="group" aria-label="Faixa de preço">
                {priceOptions.map(([value, label]) => (
                  <button
                    aria-pressed={priceRange === value}
                    className={cx(
                      styles,
                      priceRange === value ? "optChip optChipActive" : "optChip"
                    )}
                    key={value}
                    onClick={() => startTransition(() => setPriceRange(value))}
                    type="button"
                  >
                    {label}
                  </button>
                ))}
              </div>

              {colorOptions.length > 0 ? (
                <>
                  <p className={cx(styles, "groupLabel")}>Cor</p>
                  <div className={cx(styles, "chipRow")} role="group" aria-label="Filtrar por cor">
                    {colorOptions.map(({ hex, label }) => {
                      const active = selectedColors.includes(hex);

                      return (
                        <button
                          aria-pressed={active}
                          className={cx(
                            styles,
                            active ? "optChip colorChip optChipActive" : "optChip colorChip"
                          )}
                          key={hex}
                          onClick={() => toggleColor(hex)}
                          type="button"
                        >
                          <i aria-hidden="true" style={{ background: hex }} />
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </>
              ) : null}
            </div>

            <footer className={cx(styles, "sheetFoot")}>
              <button
                className={cx(styles, "clear")}
                disabled={activeFilterCount === 0}
                onClick={clearFilters}
                type="button"
              >
                Limpar tudo
              </button>
              <button
                className={cx(globalStyles, "button button-primary")}
                onClick={() => setFiltersOpen(false)}
                type="button"
              >
                Ver {visibleProducts.length}{" "}
                {visibleProducts.length === 1 ? "produto" : "produtos"}
              </button>
            </footer>
          </div>
        </>
      ) : null}

      {visibleProducts.length === 0 ? (
        <div className={cx(styles, "empty")}>
          <strong>Nenhum produto encontrado.</strong>
          <p>Ajuste a busca ou limpe os filtros para ver o catálogo completo.</p>
          <button
            className={cx(globalStyles, "button button-secondary")}
            onClick={() => {
              clearFilters();
              startTransition(() => {
                setQuery("");
                setActiveCategory("all");
              });
            }}
            type="button"
          >
            Limpar filtros
          </button>
        </div>
      ) : (
        <div className={cx(globalStyles, "product-grid")}>
          {visibleProducts.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}
    </section>
  );
}
