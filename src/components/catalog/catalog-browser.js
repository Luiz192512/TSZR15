"use client";

import globalStyles from "@/app/storefront.module.css";
import { cx } from "@/src/lib/classnames";
import { startTransition, useDeferredValue, useMemo, useState } from "react";

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
  const deferredQuery = useDeferredValue(query);
  const normalizedQuery = normalizeSearch(deferredQuery);

  const visibleProducts = useMemo(() => {
    const filtered = products.filter((product) => {
      const searchable = normalizeSearch(`${product.name} ${product.productFamily}`);
      const matchesQuery = normalizedQuery.length === 0 || searchable.includes(normalizedQuery);
      const matchesCategory =
        activeCategory === "all" || product.storefrontCategoryIds.includes(activeCategory);

      return matchesQuery && matchesCategory && matchesPriceRange(product, priceRange);
    });

    return sortProducts(filtered, sort);
  }, [products, normalizedQuery, activeCategory, priceRange, sort]);

  const availableCategories = categories.filter((category) => category.productCount > 0);

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
        <span aria-live="polite" className={cx(styles, "count")}>
          {visibleProducts.length} {visibleProducts.length === 1 ? "produto" : "produtos"}
        </span>
      </div>

      {visibleProducts.length === 0 ? (
        <div className={cx(styles, "empty")}>
          <strong>Nenhum produto encontrado.</strong>
          <p>Ajuste a busca ou limpe os filtros para ver o catálogo completo.</p>
          <button
            className={cx(globalStyles, "button button-secondary")}
            onClick={() => {
              startTransition(() => {
                setQuery("");
                setActiveCategory("all");
                setPriceRange("todos");
                setSort("relevancia");
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
