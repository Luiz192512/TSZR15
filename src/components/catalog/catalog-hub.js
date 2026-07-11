"use client";

import globalStyles from "@/app/storefront.module.css";
import { cx } from "@/src/lib/classnames";
import Image from "next/image";
import Link from "next/link";
import { startTransition, useDeferredValue, useMemo, useState } from "react";

import { formatCurrency } from "@/src/checkout/whatsapp.js";
import {
  brandLogoSrc,
  ChevronIcon,
  getFeaturedProducts,
  getProductFamilyLabel,
  getProductHref,
  getProductSummary,
  heroBoardSrc,
  normalizeSearch,
  ProductCard,
  ProductVisual,
  StoreHeader
} from "./catalog-shared.js";
import { InfiniteProductRail } from "./infinite-product-rail.js";
function CategoryRail({ activeCategory, categories, products, setActiveCategory }) {
  return (
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
      {categories
        .filter((category) => category.productCount > 0)
        .map((category) => (
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
  );
}

function FeaturedProductCarousel({ products }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const activeProduct = products[activeIndex] ?? products[0];

  if (!activeProduct) {
    return null;
  }

  function goToPrevious() {
    setActiveIndex((currentIndex) => (currentIndex === 0 ? products.length - 1 : currentIndex - 1));
  }

  function goToNext() {
    setActiveIndex((currentIndex) => (currentIndex === products.length - 1 ? 0 : currentIndex + 1));
  }

  return (
    <div className={cx(globalStyles, "featured-carousel")}>
      <div className={cx(globalStyles, "featured-carousel-head")}>
        <div>
          <p className={cx(globalStyles, "section-label")}>Principais produtos</p>
          <h2>
            Tudo o que sua <span>R15</span> precisa.
          </h2>
        </div>
        <div className={cx(globalStyles, "carousel-controls")} aria-label="Controles do carrossel">
          <button aria-label="Produto anterior" onClick={goToPrevious} type="button">
            <ChevronIcon direction="left" />
          </button>
          <button aria-label="Proximo produto" onClick={goToNext} type="button">
            <ChevronIcon direction="right" />
          </button>
        </div>
      </div>

      <div className={cx(globalStyles, "featured-carousel-window")}>
        <div className={cx(globalStyles, "featured-carousel-track")}>
          <article className={cx(globalStyles, "featured-slide")} key={activeProduct.id}>
            <ProductVisual product={activeProduct} size="feature" />
            <div className={cx(globalStyles, "featured-slide-copy")}>
              <span>{getProductFamilyLabel(activeProduct.productFamily)}</span>
              <h3>{activeProduct.name}</h3>
              <p>{getProductSummary(activeProduct)}</p>
              <div className={cx(globalStyles, "featured-slide-footer")}>
                <strong>{formatCurrency(activeProduct.priceCents)}</strong>
                <Link
                  className={cx(globalStyles, "button button-primary")}
                  href={getProductHref(activeProduct)}
                >
                  Ver detalhes
                </Link>
              </div>
            </div>
          </article>
        </div>
      </div>

      <InfiniteProductRail products={products} />
    </div>
  );
}

export function CatalogHub({ categories, currentUser, products }) {
  const [activeCategory, setActiveCategory] = useState("all");
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const normalizedQuery = normalizeSearch(deferredQuery);
  const featuredProducts = useMemo(() => getFeaturedProducts(products), [products]);

  const matchingProducts = products.filter((product) => {
    const searchable = normalizeSearch(`${product.name} ${product.productFamily}`);
    const matchesQuery = normalizedQuery.length === 0 || searchable.includes(normalizedQuery);

    return matchesQuery;
  });
  const visibleProducts = matchingProducts.filter(
    (product) => activeCategory === "all" || product.storefrontCategoryIds.includes(activeCategory)
  );

  function setSearchValue(value) {
    startTransition(() => setQuery(value));
  }

  return (
    <>
      <StoreHeader currentUser={currentUser} onSearchChange={setSearchValue} query={query} />

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
        <FeaturedProductCarousel products={featuredProducts} />
      </section>

      <div id="produtos">
        <CategoryRail
          activeCategory={activeCategory}
          categories={categories}
          products={products}
          setActiveCategory={setActiveCategory}
        />
      </div>

      {visibleProducts.length === 0 ? (
        <div className={cx(globalStyles, "empty-state")}>
          <p className={cx(globalStyles, "empty-copy")}>
            Nenhum produto encontrado com esse filtro. Tente outro termo ou abra todos.
          </p>
        </div>
      ) : (
        <section aria-label="Produtos TSZR15">
          <p className={cx(globalStyles, "hub-grid-count")}>
            {visibleProducts.length} {visibleProducts.length === 1 ? "produto" : "produtos"}
          </p>
          <div className={cx(globalStyles, "product-grid")}>
            {visibleProducts.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </section>
      )}
    </>
  );
}
