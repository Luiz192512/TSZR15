"use client";

import globalStyles from "@/app/storefront.module.css";
import { cx } from "@/src/lib/classnames";
import { startTransition, useDeferredValue, useMemo, useState } from "react";

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

export function CatalogBrowser({ categories, products }) {
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");
  const [sort, setSort] = useState("relevancia");
  const [priceRange, setPriceRange] = useState("todos");
  const [selectedColors, setSelectedColors] = useState([]);
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
  const hasActiveFilters =
    query.length > 0 ||
    activeCategory !== "all" ||
    priceRange !== "todos" ||
    selectedColors.length > 0 ||
    sort !== "relevancia";

  function toggleColor(hex) {
    startTransition(() =>
      setSelectedColors((current) =>
        current.includes(hex) ? current.filter((item) => item !== hex) : [...current, hex]
      )
    );
  }

  function clearFilters() {
    startTransition(() => {
      setQuery("");
      setActiveCategory("all");
      setPriceRange("todos");
      setSelectedColors([]);
      setSort("relevancia");
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
        <label className={cx(styles, "control")}>
          <span>Ordenar</span>
          <select onChange={(event) => setSort(event.target.value)} value={sort}>
            {sortOptions.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className={cx(styles, "control")}>
          <span>Preço</span>
          <select onChange={(event) => setPriceRange(event.target.value)} value={priceRange}>
            {priceOptions.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        {hasActiveFilters ? (
          <button className={cx(styles, "clear")} onClick={clearFilters} type="button">
            Limpar
          </button>
        ) : null}
        <span aria-live="polite" className={cx(styles, "count")}>
          {visibleProducts.length} {visibleProducts.length === 1 ? "produto" : "produtos"}
        </span>
      </div>

      {colorOptions.length > 0 ? (
        <div aria-label="Filtrar por cor" className={cx(styles, "colors")} role="group">
          <span className={cx(styles, "colorsLabel")}>Cor</span>
          {colorOptions.map(({ hex, label }) => {
            const active = selectedColors.includes(hex);

            return (
              <button
                aria-pressed={active}
                className={cx(styles, active ? "colorChip colorChipActive" : "colorChip")}
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
      ) : null}

      {visibleProducts.length === 0 ? (
        <div className={cx(styles, "empty")}>
          <strong>Nenhum produto encontrado.</strong>
          <p>Ajuste a busca ou limpe os filtros para ver o catálogo completo.</p>
          <button
            className={cx(globalStyles, "button button-secondary")}
            onClick={clearFilters}
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
