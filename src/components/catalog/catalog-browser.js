import globalStyles from "@/app/storefront.module.css";
import { cx } from "@/src/lib/classnames";
import Link from "next/link";

import { ProductCard } from "./product-card.js";
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

function normalizedFilters(filters = {}) {
  return {
    category: String(filters.category ?? "all"),
    colors: Array.isArray(filters.colors)
      ? filters.colors
      : String(filters.colors ?? "")
          .split(",")
          .filter(Boolean),
    priceRange: String(filters.priceRange ?? "todos"),
    query: String(filters.query ?? ""),
    sort: String(filters.sort ?? "relevancia")
  };
}

function catalogHref(filters, overrides = {}) {
  const next = { ...normalizedFilters(filters), ...overrides };
  const params = new URLSearchParams();

  if (next.query) params.set("busca", next.query);
  if (next.category && next.category !== "all") params.set("categoria", next.category);
  if (next.sort && next.sort !== "relevancia") params.set("ordem", next.sort);
  if (next.priceRange && next.priceRange !== "todos") params.set("preco", next.priceRange);
  for (const color of next.colors ?? []) params.append("cor", color);
  if (Number(next.page) > 1) params.set("pagina", String(next.page));

  const query = params.toString();
  return query ? `/catalogo?${query}` : "/catalogo";
}

function Pagination({ catalogPage, filters }) {
  if (catalogPage.pageCount <= 1) {
    return null;
  }

  const pages = Array.from({ length: catalogPage.pageCount }, (_, index) => index + 1);

  return (
    <nav aria-label="Paginação do catálogo" className={cx(styles, "pagination")}>
      {catalogPage.page > 1 ? (
        <Link href={catalogHref(filters, { page: catalogPage.page - 1 })}>Anterior</Link>
      ) : null}
      {pages.map((page) => (
        <Link
          aria-current={page === catalogPage.page ? "page" : undefined}
          className={cx(styles, page === catalogPage.page ? "pageActive" : "")}
          href={catalogHref(filters, { page })}
          key={page}
        >
          {page}
        </Link>
      ))}
      {catalogPage.page < catalogPage.pageCount ? (
        <Link href={catalogHref(filters, { page: catalogPage.page + 1 })}>Próxima</Link>
      ) : null}
    </nav>
  );
}

export function CatalogBrowser({
  catalogPage,
  catalogTotal,
  categories,
  colorOptions = [],
  filters = {}
}) {
  const activeFilters = normalizedFilters(filters);
  const availableCategories = categories.filter((category) => category.productCount > 0);

  return (
    <section className={cx(styles, "browser")}>
      <header className={cx(styles, "head")}>
        <p className={cx(globalStyles, "section-label")}>Catálogo R15</p>
        <h1>Todos os produtos</h1>
      </header>

      <form action="/catalogo" className={cx(styles, "serverFilters")} method="get">
        <label className={cx(globalStyles, "store-search")} htmlFor="catalog-browser-search">
          <span>Buscar</span>
          <input
            defaultValue={activeFilters.query}
            id="catalog-browser-search"
            name="busca"
            placeholder="Escapamentos, sliders, manetes..."
          />
        </label>

        <div className={cx(styles, "filterGrid")}>
          <label>
            <span>Categoria</span>
            <select defaultValue={activeFilters.category} name="categoria">
              <option value="all">Todas as categorias</option>
              {availableCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.label} ({category.productCount})
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Ordenar por</span>
            <select defaultValue={activeFilters.sort} name="ordem">
              {sortOptions.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Faixa de preço</span>
            <select defaultValue={activeFilters.priceRange} name="preco">
              {priceOptions.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {colorOptions.length > 0 ? (
          <fieldset className={cx(styles, "colorFilters")}>
            <legend>Cor</legend>
            {colorOptions.map(({ hex, label }) => (
              <label key={hex}>
                <input
                  defaultChecked={activeFilters.colors.includes(hex)}
                  name="cor"
                  type="checkbox"
                  value={hex}
                />
                <i aria-hidden="true" style={{ background: hex }} />
                <span>{label}</span>
              </label>
            ))}
          </fieldset>
        ) : null}

        <div className={cx(styles, "filterActions")}>
          <button className={cx(globalStyles, "button button-primary")} type="submit">
            Aplicar filtros
          </button>
          <Link className={cx(globalStyles, "button button-secondary")} href="/catalogo">
            Limpar
          </Link>
        </div>
      </form>

      <nav className={cx(globalStyles, "category-strip")} aria-label="Categorias">
        <Link
          aria-current={activeFilters.category === "all" ? "page" : undefined}
          className={cx(
            globalStyles,
            `category-token ${activeFilters.category === "all" ? "is-active" : ""}`
          )}
          href={catalogHref(activeFilters, { category: "all", page: 1 })}
        >
          <span>{catalogTotal}</span>
          Todos
        </Link>
        {availableCategories.map((category) => (
          <Link
            aria-current={activeFilters.category === category.id ? "page" : undefined}
            className={cx(
              globalStyles,
              `category-token ${activeFilters.category === category.id ? "is-active" : ""}`
            )}
            href={catalogHref(activeFilters, { category: category.id, page: 1 })}
            key={category.id}
          >
            <span>{category.productCount}</span>
            {category.label}
          </Link>
        ))}
      </nav>

      <div className={cx(styles, "toolbar")}>
        <span className={cx(styles, "count")}>
          {catalogPage.total} {catalogPage.total === 1 ? "produto" : "produtos"}
        </span>
      </div>

      {catalogPage.products.length === 0 ? (
        <div className={cx(styles, "empty")}>
          <strong>Nenhum produto encontrado.</strong>
          <p>Ajuste a busca ou limpe os filtros para ver o catálogo completo.</p>
          <Link className={cx(globalStyles, "button button-secondary")} href="/catalogo">
            Limpar filtros
          </Link>
        </div>
      ) : (
        <div className={cx(globalStyles, "product-grid")}>
          {catalogPage.products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}

      <Pagination catalogPage={catalogPage} filters={activeFilters} />
    </section>
  );
}
