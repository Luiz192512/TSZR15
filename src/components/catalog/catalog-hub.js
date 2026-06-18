"use client";

import Image from "next/image";
import Link from "next/link";
import { startTransition, useDeferredValue, useMemo, useRef, useState } from "react";

import { groupProductsByCategory } from "@/src/catalog/index.js";
import { formatCurrency } from "@/src/checkout/whatsapp.js";
import {
  brandLogoSrc,
  ChevronIcon,
  getFeaturedProducts,
  getProductCode,
  getProductFamilyLabel,
  getProductHref,
  getProductSummary,
  heroBoardSrc,
  normalizeSearch,
  ProductCard,
  ProductVisual,
  StoreHeader
} from "./catalog-shared.js";
function CategoryRail({ activeCategory, categories, products, setActiveCategory }) {
  return (
    <nav className="category-strip" aria-label="Categorias">
      <button
        className={`category-token ${activeCategory === "all" ? "is-active" : ""}`}
        onClick={() => startTransition(() => setActiveCategory("all"))}
        type="button"
      >
        <span>{products.length}</span>
        Todos
      </button>
      {categories.map((category) => (
        <button
          className={`category-token ${activeCategory === category.id ? "is-active" : ""}`}
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
    <div className="featured-carousel">
      <div className="featured-carousel-head">
        <div>
          <p className="section-label">Principais produtos</p>
          <h2>
            Tudo o que sua <span>R15</span> precisa.
          </h2>
        </div>
        <div className="carousel-controls" aria-label="Controles do carrossel">
          <button aria-label="Produto anterior" onClick={goToPrevious} type="button">
            <ChevronIcon direction="left" />
          </button>
          <button aria-label="Proximo produto" onClick={goToNext} type="button">
            <ChevronIcon direction="right" />
          </button>
        </div>
      </div>

      <div className="featured-carousel-window">
        <div className="featured-carousel-track">
          <article className="featured-slide" key={activeProduct.id}>
            <ProductVisual product={activeProduct} size="feature" />
            <div className="featured-slide-copy">
              <span>{getProductFamilyLabel(activeProduct.productFamily)}</span>
              <h3>{activeProduct.name}</h3>
              <p>{getProductSummary(activeProduct)}</p>
              <div className="featured-slide-footer">
                <strong>{formatCurrency(activeProduct.priceCents)}</strong>
                <Link className="button button-primary" href={getProductHref(activeProduct)}>
                  Ver detalhes
                </Link>
              </div>
            </div>
          </article>
        </div>
      </div>

      <div className="featured-thumbs" aria-label="Produtos em destaque">
        {products.map((product, index) => (
          <button
            className={index === activeIndex ? "is-active" : ""}
            key={product.id}
            onClick={() => setActiveIndex(index)}
            type="button"
          >
            <span>{getProductCode(product)}</span>
            <strong>{product.name}</strong>
          </button>
        ))}
      </div>
    </div>
  );
}

function CategoryProductCarousel({ category }) {
  const trackRef = useRef(null);

  function scrollByPage(direction) {
    const track = trackRef.current;

    if (!track) {
      return;
    }

    track.scrollBy({
      left: direction * Math.max(track.clientWidth - 80, 260),
      behavior: "smooth"
    });
  }

  return (
    <section className="category-carousel-section" aria-labelledby={`category-${category.id}`}>
      <div className="category-carousel-heading">
        <div>
          <p className="section-label">Categoria</p>
          <h2 id={`category-${category.id}`}>{category.label}</h2>
        </div>
        <div className="category-carousel-actions">
          <span>{category.products.length} itens</span>
          <div className="carousel-controls" aria-label={`Controles de ${category.label}`}>
            <button
              aria-label={`Ver itens anteriores de ${category.label}`}
              onClick={() => scrollByPage(-1)}
              type="button"
            >
              <ChevronIcon direction="left" />
            </button>
            <button
              aria-label={`Ver proximos itens de ${category.label}`}
              onClick={() => scrollByPage(1)}
              type="button"
            >
              <ChevronIcon direction="right" />
            </button>
          </div>
        </div>
      </div>

      <div className="category-carousel-track" ref={trackRef}>
        {category.products.map((product) => (
          <ProductCard key={`${category.id}-${product.id}`} product={product} />
        ))}
      </div>
    </section>
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
  const visibleCategories = groupProductsByCategory(visibleProducts).filter(
    (category) => category.products.length > 0
  );

  function setSearchValue(value) {
    startTransition(() => setQuery(value));
  }

  return (
    <>
      <StoreHeader currentUser={currentUser} onSearchChange={setSearchValue} query={query} />

      <section className="brand-hero">
        <div className="brand-hero-copy">
          <div className="hero-brand-row">
            <Image
              alt="TSZ Store"
              className="hero-logo"
              height={2000}
              sizes="188px"
              src={brandLogoSrc}
              width={2000}
            />
            <p className="hero-kicker">Performance parts for Yamaha R15</p>
          </div>
          <h1>
            Sua R15 <span>em outro nivel</span>
          </h1>
          <p className="hero-lead">
            Peças e acessórios selecionados para quem exige visual agressivo, acabamento premium e
            atendimento direto no WhatsApp.
          </p>
          <div className="hero-actions">
            <a className="button button-primary" href="#produtos">
              Ver produtos
            </a>
            <a className="button button-ghost" href="#lancamentos">
              Conferir lançamentos
            </a>
          </div>
        </div>

        <div className="brand-hero-media">
          <div className="hero-media-frame">
            <Image
              alt="Yamaha R15 preta em arte promocional TSZ Store"
              fill
              priority
              sizes="100vw"
              src={heroBoardSrc}
            />
          </div>
        </div>
      </section>

      <section className="product-band" id="lancamentos">
        <div className="product-band-copy">
          <p className="section-label">Estética + performance + exclusividade</p>
          <h2>Seleção principal TSZR15.</h2>
          <p>
            Escapamentos, sliders, manetes, pedaleiras, bolhas e iluminação em uma vitrine feita
            para montar o conjunto certo sem sair do foco R15.
          </p>
        </div>
        <FeaturedProductCarousel products={featuredProducts} />
      </section>

      <section className="brand-proof-strip" id="sobre" aria-label="Diferenciais da loja">
        <div>
          <strong>Especialistas em Yamaha R15</strong>
          <span>catálogo focado no modelo certo</span>
        </div>
        <div>
          <strong>Peças selecionadas</strong>
          <span>compra assistida com validação interna</span>
        </div>
        <div>
          <strong>Atendimento especializado</strong>
          <span>fechamento direto pelo WhatsApp</span>
        </div>
        <div>
          <strong>Pagamento seguro</strong>
          <span>pedido revisado antes do envio</span>
        </div>
      </section>

      <section className="hub-intro" id="produtos">
        <div>
          <p className="section-label">Produtos selecionados</p>
          <h1>Catálogo R15 com compra assistida TSZR15.</h1>
        </div>
        <p>
          Consulte disponibilidade, escolha a variação no produto e finalize o pedido pelo carrinho
          com atendimento direto.
        </p>
      </section>

      <CategoryRail
        activeCategory={activeCategory}
        categories={categories}
        products={products}
        setActiveCategory={setActiveCategory}
      />

      {visibleProducts.length === 0 ? (
        <div className="empty-state">
          <p className="empty-copy">
            Nenhum produto encontrado com esse filtro. Tente outro termo ou abra todos.
          </p>
        </div>
      ) : (
        <div className="category-carousel-list" aria-label="Produtos TSZR15 por categoria">
          {visibleCategories.map((category) => (
            <CategoryProductCarousel category={category} key={category.id} />
          ))}
        </div>
      )}
    </>
  );
}
