import globalStyles from "@/app/storefront.module.css";
import { cx } from "@/src/lib/classnames";
import Image from "next/image";
import Link from "next/link";

import { brandLogoSrc, heroBoardSrc, StoreHeader } from "./catalog-shared.js";
import { FeaturedProductCarousel } from "./featured-product-carousel.js";
import { ProductCard } from "./product-card.js";

function homeHref(filters, overrides = {}) {
  const next = { ...filters, ...overrides };
  const params = new URLSearchParams();

  if (next.query) params.set("busca", next.query);
  if (next.category && next.category !== "all") params.set("categoria", next.category);
  if (Number(next.page) > 1) params.set("pagina", String(next.page));

  const query = params.toString();
  return query ? `/?${query}#produtos` : "/#produtos";
}

function CategoryRail({ catalogTotal, categories, filters }) {
  return (
    <nav className={cx(globalStyles, "category-strip")} aria-label="Categorias">
      <Link
        aria-current={filters.category === "all" ? "page" : undefined}
        className={cx(
          globalStyles,
          `category-token ${filters.category === "all" ? "is-active" : ""}`
        )}
        href={homeHref(filters, { category: "all", page: 1 })}
      >
        <span>{catalogTotal}</span>
        Todos
      </Link>
      {categories
        .filter((category) => category.productCount > 0)
        .map((category) => (
          <Link
            aria-current={filters.category === category.id ? "page" : undefined}
            className={cx(
              globalStyles,
              `category-token ${filters.category === category.id ? "is-active" : ""}`
            )}
            href={homeHref(filters, { category: category.id, page: 1 })}
            key={category.id}
          >
            <span>{category.productCount}</span>
            {category.label}
          </Link>
        ))}
    </nav>
  );
}

function HomePagination({ catalogPage, filters }) {
  if (catalogPage.pageCount <= 1) return null;

  return (
    <nav aria-label="Paginação dos produtos" className={cx(globalStyles, "catalog-pagination")}>
      {catalogPage.page > 1 ? (
        <Link href={homeHref(filters, { page: catalogPage.page - 1 })}>Anterior</Link>
      ) : null}
      <span>
        Página {catalogPage.page} de {catalogPage.pageCount}
      </span>
      {catalogPage.page < catalogPage.pageCount ? (
        <Link href={homeHref(filters, { page: catalogPage.page + 1 })}>Próxima</Link>
      ) : null}
    </nav>
  );
}

export function CatalogHub({
  catalogPage,
  catalogTotal,
  categories,
  currentUser,
  featuredProducts = [],
  filters
}) {
  return (
    <>
      <StoreHeader currentUser={currentUser} showSearch={false} />

      <section className={cx(globalStyles, "brand-hero")}>
        <div className={cx(globalStyles, "brand-hero-copy")}>
          <div className={cx(globalStyles, "hero-brand-row")}>
            <Image
              alt="TSZ Store"
              className={cx(globalStyles, "hero-logo")}
              height={2000}
              sizes="188px"
              src={brandLogoSrc}
              width={2000}
            />
            <p className={cx(globalStyles, "hero-kicker")}>Performance parts for Yamaha R15</p>
          </div>
          <h1>
            Sua R15 <span>em outro nível</span>
          </h1>
          <p className={cx(globalStyles, "hero-lead")}>
            Peças e acessórios selecionados para quem exige visual agressivo, acabamento premium e
            atendimento direto no WhatsApp.
          </p>
          <div className={cx(globalStyles, "hero-actions")}>
            <a className={cx(globalStyles, "button button-primary")} href="#produtos">
              Ver produtos
            </a>
            <a className={cx(globalStyles, "button button-ghost")} href="#lancamentos">
              Conferir lançamentos
            </a>
          </div>
        </div>

        <div className={cx(globalStyles, "brand-hero-media")}>
          <div className={cx(globalStyles, "hero-media-frame")}>
            <Image
              alt="Yamaha R15 preta em arte promocional TSZ Store"
              fetchPriority="high"
              fill
              priority
              sizes="(min-width: 1280px) 60vw, 100vw"
              src={heroBoardSrc}
            />
          </div>
        </div>
      </section>

      <section className={cx(globalStyles, "product-band")} id="lancamentos">
        <div className={cx(globalStyles, "product-band-copy")}>
          <p className={cx(globalStyles, "section-label")}>
            Estética + performance + exclusividade
          </p>
          <h2>Seleção principal TSZR15.</h2>
          <p>
            Escapamentos, sliders, manetes, pedaleiras, bolhas e iluminação em uma vitrine feita
            para montar o conjunto certo sem sair do foco R15.
          </p>
        </div>
        <FeaturedProductCarousel featuredProducts={featuredProducts} />
      </section>

      <section id="produtos">
        <form
          action="/#produtos"
          className={cx(globalStyles, "storefront-server-search")}
          method="get"
        >
          {filters.category !== "all" ? (
            <input name="categoria" type="hidden" value={filters.category} />
          ) : null}
          <label className={cx(globalStyles, "store-search")} htmlFor="home-catalog-search">
            <span>Buscar</span>
            <input
              defaultValue={filters.query}
              id="home-catalog-search"
              name="busca"
              placeholder="Escapamentos, sliders, manetes..."
            />
          </label>
          <button className={cx(globalStyles, "button button-primary")} type="submit">
            Buscar
          </button>
          {filters.query ? (
            <Link className={cx(globalStyles, "button button-secondary")} href="/#produtos">
              Limpar
            </Link>
          ) : null}
        </form>

        <CategoryRail catalogTotal={catalogTotal} categories={categories} filters={filters} />
      </section>

      {catalogPage.products.length === 0 ? (
        <div className={cx(globalStyles, "empty-state")}>
          <p className={cx(globalStyles, "empty-copy")}>
            Nenhum produto encontrado com esse filtro. Tente outro termo ou abra todos.
          </p>
        </div>
      ) : (
        <section aria-label="Produtos TSZR15">
          <p className={cx(globalStyles, "hub-grid-count")}>
            {catalogPage.total} {catalogPage.total === 1 ? "produto" : "produtos"}
          </p>
          <div className={cx(globalStyles, "product-grid")}>
            {catalogPage.products.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
          <HomePagination catalogPage={catalogPage} filters={filters} />
        </section>
      )}
    </>
  );
}
