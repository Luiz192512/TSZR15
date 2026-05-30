"use client";

import Link from "next/link";
import { startTransition, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";

import { formatCategoryLabels, groupProductsByCategory } from "@/src/catalog/index.js";
import { ASSISTED_PURCHASE_CONSENT_TEXT } from "@/src/customer/customer-data.js";
import {
  fetchCepAddress,
  formatCepAddressLine,
  getCepDigits
} from "@/src/customer/cep-lookup.js";
import {
  cepPattern,
  phonePattern,
  sanitizeCep,
  sanitizePhone,
  sanitizeTaxId,
  taxIdPattern,
  validateCustomerFieldFormats
} from "@/src/customer/field-validation.js";
import {
  buildWhatsAppOrderMessage,
  calculateCartTotals,
  formatCurrency,
  paymentMethods,
  shippingOptions
} from "@/src/checkout/whatsapp.js";
import {
  getCartItemKey,
  removeCartItem,
  sanitizeCartItems,
  updateCartItemQuantity,
  updateCartItemVariation
} from "@/src/cart/cart-items.js";
import { ProfileLink } from "@/src/components/profile-link.js";

const storeName = process.env.NEXT_PUBLIC_STORE_NAME ?? "TSZR15";
const cartStorageKey = "tszr15-cart";
const brandLogoSrc = "/brand/logo-tszr15-store.png";
const heroBoardSrc =
  "https://mckthvbwddxipghumrpw.supabase.co/storage/v1/object/public/brand-assets/tszr15-hero-r15-dark.png";

const featuredProductIds = [
  "escapamento-sc-project-completo",
  "kit-suporte-slider",
  "kit-manete-manopla-pesinho",
  "bolha-esportiva",
  "farol-led-drl-predator-eye",
  "protetor-de-radiador-aluminio"
];

const emptyCustomer = {
  address: "",
  cep: "",
  email: "",
  name: "",
  notes: "",
  phone: "",
  taxId: "",
  whatsapp: ""
};

const familyLabels = {
  aero_front: "Aerodinâmica",
  adesivo_detalhe: "Adesivo detalhe",
  adesivo_full: "Adesivo completo",
  cockpit: "Cockpit",
  controles: "Controles",
  escapamento: "Escapamento",
  iluminacao: "Iluminação",
  manutencao: "Manutenção",
  protecao: "Proteção",
  retrovisor: "Retrovisor",
  slider: "Slider",
  tanque: "Tanque"
};

const familySummaries = {
  aero_front: "Peça de visual e aerodinâmica para montar a frente ou acabamento da R15.",
  adesivo_detalhe: "Adesivo de detalhe para personalizar a R15 sem trocar a carenagem.",
  adesivo_full: "Kit visual completo para mudar a identidade da moto com acabamento combinado.",
  cockpit: "Item de cockpit para melhorar acabamento, uso diário ou proteção da área do piloto.",
  controles: "Comando ou acabamento de pilotagem para deixar a R15 mais ajustada ao uso.",
  escapamento: "Opção de escape ou admissão para montar o conjunto conforme disponibilidade.",
  iluminacao: "Iluminação e sinalização para atualizar o visual e a segurança da moto.",
  manutencao: "Item de reposição, limpeza ou cuidado para manter a R15 em dia.",
  protecao: "Proteção para reduzir dano em uso urbano, queda leve ou desgaste de peça.",
  retrovisor: "Retrovisor ou acabamento lateral para visual esportivo e uso no dia a dia.",
  slider: "Slider e suporte para proteger pontos expostos da Yamaha R15.",
  tanque: "Proteção ou acabamento para tanque com opções de cor e textura."
};

function normalizeSearch(value) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function getProductCode(product) {
  return product.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function getProductFamilyLabel(productFamily) {
  return familyLabels[productFamily] ?? String(productFamily ?? "").replaceAll("_", " ");
}

function getProductSummary(product) {
  return product.notes || familySummaries[product.productFamily] || "Produto curado para Yamaha R15.";
}

function getInitialCustomer(initialCustomer) {
  return {
    ...emptyCustomer,
    ...(initialCustomer ?? {})
  };
}

function getProductHref(product) {
  return `/produto/${product.slug}`;
}

function getProductImages(product) {
  return Array.isArray(product.imageUrls)
    ? product.imageUrls.filter((imageUrl) => typeof imageUrl === "string" && imageUrl.trim())
    : [];
}

function getFeaturedProducts(products) {
  const productsById = new Map(products.map((product) => [product.id, product]));
  const selectedProducts = featuredProductIds
    .map((productId) => productsById.get(productId))
    .filter(Boolean);
  const selectedIds = new Set(selectedProducts.map((product) => product.id));
  const fallbackProducts = products.filter((product) => !selectedIds.has(product.id));

  return [...selectedProducts, ...fallbackProducts].slice(0, 8);
}

function readStoredCart() {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const storedValue = window.localStorage.getItem(cartStorageKey);
    const parsedItems = storedValue ? JSON.parse(storedValue) : [];

    return Array.isArray(parsedItems) ? parsedItems : [];
  } catch {
    return [];
  }
}

function writeStoredCart(items) {
  if (typeof window === "undefined") {
    return;
  }

  if (!Array.isArray(items) || items.length === 0) {
    window.localStorage.removeItem(cartStorageKey);
  } else {
    window.localStorage.setItem(cartStorageKey, JSON.stringify(items));
  }

  window.dispatchEvent(new Event("tszr15-cart-changed"));
}

function clearStoredCart() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(cartStorageKey);
  window.dispatchEvent(new Event("tszr15-cart-changed"));
}

function getCartCount(items) {
  return items.reduce((total, item) => total + item.quantity, 0);
}

function useCartCount() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    function refreshCount() {
      setCount(getCartCount(readStoredCart()));
    }

    refreshCount();
    window.addEventListener("storage", refreshCount);
    window.addEventListener("tszr15-cart-changed", refreshCount);

    return () => {
      window.removeEventListener("storage", refreshCount);
      window.removeEventListener("tszr15-cart-changed", refreshCount);
    };
  }, []);

  return count;
}

function ProductVisual({ product, size = "card" }) {
  const categoryLabel = formatCategoryLabels(product.storefrontCategoryIds)[0] ?? "R15";
  const familyClass = `family-${product.productFamily}`;
  const [coverImage] = getProductImages(product);

  return (
    <div
      className={`product-image product-image-${size} ${familyClass} ${
        coverImage ? "has-product-photo" : ""
      }`}
    >
      {coverImage ? (
        <img className="product-photo" src={coverImage} alt={product.name} />
      ) : (
        <>
          <img
            alt=""
            aria-hidden="true"
            className="product-image-logo"
            src={brandLogoSrc}
          />
          <span>{categoryLabel}</span>
          <strong>{getProductCode(product)}</strong>
        </>
      )}
    </div>
  );
}

function ChevronIcon({ direction }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
      <path
        d={direction === "left" ? "M15 18l-6-6 6-6" : "M9 6l6 6-6 6"}
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.4"
      />
    </svg>
  );
}

function StoreHeader({ currentUser, onSearchChange, query = "", showSearch = true }) {
  const cartCount = useCartCount();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  function closeMenu() {
    setIsMenuOpen(false);
  }

  return (
    <header
      className={`store-header ${showSearch ? "" : "store-header-compact"} ${
        isMenuOpen ? "is-menu-open" : ""
      }`}
    >
      <div className="store-header-top">
        <Link className="store-brand" href="/" onClick={closeMenu}>
          <img className="store-logo-image" src={brandLogoSrc} alt="TSZ Store" />
          <span>
            <strong>TSZR15</strong>
            <small>Performance parts R15</small>
          </span>
        </Link>

        <div className="mobile-nav-actions">
          <Link className="cart-nav-link mobile-cart-link" href="/pedido" onClick={closeMenu}>
            Carrinho
            <span>{cartCount}</span>
          </Link>
          <button
            aria-controls="store-mobile-menu"
            aria-expanded={isMenuOpen}
            className="mobile-menu-button"
            onClick={() => setIsMenuOpen((currentValue) => !currentValue)}
            type="button"
          >
            Menu
            <span aria-hidden="true" className="mobile-menu-icon" />
          </button>
        </div>
      </div>

      {showSearch ? (
        <label className="store-search" htmlFor="catalog-search">
          <span>Buscar</span>
          <input
            id="catalog-search"
            onChange={(event) => onSearchChange?.(event.target.value)}
            placeholder="Escapamentos, sliders, manetes..."
            value={query}
          />
        </label>
      ) : null}

      <nav className="store-nav" id="store-mobile-menu" aria-label="Navegacao principal">
        <Link href="/" onClick={closeMenu}>Inicio</Link>
        <Link href="/catalogo#produtos" onClick={closeMenu}>Produtos</Link>
        <Link href="/#lancamentos" onClick={closeMenu}>Lancamentos</Link>
        <Link href="/#sobre" onClick={closeMenu}>Sobre nos</Link>
        <Link className="cart-nav-link" href="/pedido" onClick={closeMenu}>
          Carrinho
          <span>{cartCount}</span>
        </Link>
        {currentUser ? (
          <>
            <ProfileLink className="store-profile-link desktop-account-link" user={currentUser} />
            <Link className="mobile-nav-link" href="/conta" onClick={closeMenu}>
              Conta
            </Link>
          </>
        ) : (
          <Link className="button button-secondary" href="/entrar" onClick={closeMenu}>
            Entrar
          </Link>
        )}
      </nav>
    </header>
  );
}

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

function ProductCard({ product }) {
  const categoryLabels = formatCategoryLabels(product.storefrontCategoryIds);

  return (
    <Link className="hub-product-card" href={getProductHref(product)}>
      <ProductVisual product={product} />

      <div className="hub-product-copy">
        <div className="badge-row">
          <span className="badge badge-category">{categoryLabels[0] ?? "R15"}</span>
          <span className="badge badge-family">{getProductFamilyLabel(product.productFamily)}</span>
        </div>

        <h2>{product.name}</h2>
        <p>{getProductSummary(product)}</p>

        <div className="card-price-row">
          <strong>{formatCurrency(product.priceCents)}</strong>
          <span>Ver detalhes</span>
        </div>
      </div>
    </Link>
  );
}

function FeaturedProductCarousel({ products }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const activeProduct = products[activeIndex] ?? products[0];

  if (!activeProduct) {
    return null;
  }

  function goToPrevious() {
    setActiveIndex((currentIndex) =>
      currentIndex === 0 ? products.length - 1 : currentIndex - 1
    );
  }

  function goToNext() {
    setActiveIndex((currentIndex) =>
      currentIndex === products.length - 1 ? 0 : currentIndex + 1
    );
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
        <div
          className="featured-carousel-track"
          style={{ transform: `translateX(-${activeIndex * 100}%)` }}
        >
          {products.map((product) => (
            <article className="featured-slide" key={product.id}>
              <ProductVisual product={product} size="feature" />
              <div className="featured-slide-copy">
                <span>{getProductFamilyLabel(product.productFamily)}</span>
                <h3>{product.name}</h3>
                <p>{getProductSummary(product)}</p>
                <div className="featured-slide-footer">
                  <strong>{formatCurrency(product.priceCents)}</strong>
                  <Link className="button button-primary" href={getProductHref(product)}>
                    Ver detalhes
                  </Link>
                </div>
              </div>
            </article>
          ))}
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
            <img className="hero-logo" src={brandLogoSrc} alt="TSZ Store" />
            <p className="hero-kicker">Performance parts for Yamaha R15</p>
          </div>
          <h1>
            Sua R15 <span>em outro nivel</span>
          </h1>
          <p className="hero-lead">
            Peças e acessórios selecionados para quem exige visual agressivo,
            acabamento premium e atendimento direto no WhatsApp.
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
            <img src={heroBoardSrc} alt="Yamaha R15 preta em arte promocional TSZ Store" />
          </div>
        </div>
      </section>

      <section className="product-band" id="lancamentos">
        <div className="product-band-copy">
          <p className="section-label">Estética + performance + exclusividade</p>
          <h2>Seleção principal TSZR15.</h2>
          <p>
            Escapamentos, sliders, manetes, pedaleiras, bolhas e iluminação em
            uma vitrine feita para montar o conjunto certo sem sair do foco R15.
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
          Consulte disponibilidade, escolha a variação no produto e finalize o
          pedido pelo carrinho com atendimento direto.
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
            Nenhum produto encontrado com esse filtro. Tente outro têrmo ou abra todos.
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

function ProductImageCarousel({ product }) {
  const images = getProductImages(product);
  const [activeIndex, setActiveIndex] = useState(0);
  const activeImage = images[activeIndex];

  if (!activeImage) {
    return <ProductVisual product={product} size="detail" />;
  }

  function goToPrevious() {
    setActiveIndex((currentIndex) =>
      currentIndex === 0 ? images.length - 1 : currentIndex - 1
    );
  }

  function goToNext() {
    setActiveIndex((currentIndex) =>
      currentIndex === images.length - 1 ? 0 : currentIndex + 1
    );
  }

  return (
    <div className="product-photo-carousel">
      <div className="product-photo-main">
        <img src={activeImage} alt={product.name} />
        {images.length > 1 ? (
          <div className="product-photo-controls" aria-label="Controles das imagens do produto">
            <button aria-label="Imagem anterior" onClick={goToPrevious} type="button">
              <ChevronIcon direction="left" />
            </button>
            <button aria-label="Proxima imagem" onClick={goToNext} type="button">
              <ChevronIcon direction="right" />
            </button>
          </div>
        ) : null}
      </div>

      {images.length > 1 ? (
        <div className="product-photo-thumbs" aria-label="Miniaturas do produto">
          {images.map((imageUrl, index) => (
            <button
              aria-label={`Ver imagem ${index + 1}`}
              className={index === activeIndex ? "is-active" : ""}
              key={imageUrl}
              onClick={() => setActiveIndex(index)}
              type="button"
            >
              <img src={imageUrl} alt="" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function ProductDetails({ currentUser, product, relatedProducts = [] }) {
  const [selectedVariation, setSelectedVariation] = useState(product.variations[0]);
  const [quantity, setQuantity] = useState(1);
  const [feedback, setFeedback] = useState("");
  const categoryLabels = formatCategoryLabels(product.storefrontCategoryIds);
  const totalCents = product.priceCents * quantity;

  function addToCart() {
    const currentCart = readStoredCart();
    const cartKey = getCartItemKey(product.id, selectedVariation);
    const existingItem = currentCart.find((item) => item.cartKey === cartKey);
    const nextItems = existingItem
      ? currentCart.map((item) =>
          item.cartKey === cartKey ? { ...item, quantity: item.quantity + quantity } : item
        )
      : [
          ...currentCart,
          {
            cartKey,
            id: product.id,
            name: product.name,
            priceCents: product.priceCents,
            productFamily: product.productFamily,
            quantity,
            slug: product.slug,
            variation: selectedVariation
          }
        ];

    writeStoredCart(nextItems);
    setFeedback("Produto adicionado ao carrinho.");
  }

  return (
    <>
      <StoreHeader currentUser={currentUser} showSearch={false} />

      <section className="product-detail-layout">
        <div className="product-detail-media">
          <ProductImageCarousel product={product} />
          <div className="detail-assist-box">
            <strong>Compra assistida</strong>
            <span>
              Você compra com a TSZR15. A operação interna válida disponibilidade e entrega antes
              de fechar o atendimento.
            </span>
          </div>
        </div>

        <article className="product-detail-panel">
          <Link className="back-link" href="/">
            Voltar para produtos
          </Link>
          <div className="badge-row">
            {categoryLabels.map((label) => (
              <span className="badge badge-category" key={label}>
                {label}
              </span>
            ))}
            <span className="badge badge-family">{getProductFamilyLabel(product.productFamily)}</span>
          </div>

          <h1>{product.name}</h1>
          <p className="detail-summary">{getProductSummary(product)}</p>
          <strong className="detail-price">{formatCurrency(product.priceCents)}</strong>

          <div className="option-group">
            <span>Cor / variação</span>
            <div className="variation-grid" role="list">
              {product.variations.map((variation) => (
                <button
                  className={selectedVariation === variation ? "is-active" : ""}
                  key={variation}
                  onClick={() => setSelectedVariation(variation)}
                  type="button"
                >
                  {variation}
                </button>
              ))}
            </div>
          </div>

          <div className="quantity-row">
            <span>Quantidade</span>
            <div className="quantity-control">
              <button onClick={() => setQuantity((current) => Math.max(current - 1, 1))} type="button">
                -
              </button>
              <span>{quantity}</span>
              <button onClick={() => setQuantity((current) => Math.min(current + 1, 99))} type="button">
                +
              </button>
            </div>
            <strong>{formatCurrency(totalCents)}</strong>
          </div>

          <dl className="product-info-grid">
            <div>
              <dt>Modelo</dt>
              <dd>Yamaha R15</dd>
            </div>
            <div>
              <dt>Prazo de confirmação</dt>
              <dd>Até {product.leadTimeDays} dias úteis</dd>
            </div>
            <div>
              <dt>Disponibilidade</dt>
              <dd>{product.availability === "sob-consulta" ? "Sob consulta" : product.availability}</dd>
            </div>
            <div>
              <dt>Fechamento</dt>
              <dd>WhatsApp TSZR15</dd>
            </div>
          </dl>

          {feedback ? <p className="form-alert">{feedback}</p> : null}

          <div className="detail-actions">
            <button className="button button-primary" onClick={addToCart} type="button">
              Adicionar ao carrinho
            </button>
            <Link className="button button-secondary" href="/pedido">
              Ir para o carrinho
            </Link>
          </div>
        </article>
      </section>

      {relatedProducts.length > 0 ? (
        <section className="related-section">
          <div className="section-heading compact-heading">
            <div>
              <p className="section-label">Produtos relacionados</p>
              <h2>Continue vendo itens da mesma linha.</h2>
            </div>
          </div>
          <div className="product-grid related-grid">
            {relatedProducts.map((relatedProduct) => (
              <ProductCard key={relatedProduct.id} product={relatedProduct} />
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}

export function CartCheckout({
  currentUser,
  initialCustomer,
  isSupabaseConfigured,
  products
}) {
  const [cartItems, setCartItems] = useState([]);
  const [hasLoadedCart, setHasLoadedCart] = useState(false);
  const [paymentMethodId, setPaymentMethodId] = useState("pix");
  const [shippingOptionId, setShippingOptionId] = useState("combinar");
  const [hasDataConsent, setHasDataConsent] = useState(Boolean(currentUser));
  const [checkoutFeedback, setCheckoutFeedback] = useState("");
  const [cepLookup, setCepLookup] = useState({ message: "", status: "idle" });
  const [cepWasEdited, setCepWasEdited] = useState(false);
  const [autoFilledAddressLine, setAutoFilledAddressLine] = useState("");
  const [isSubmittingCheckout, setIsSubmittingCheckout] = useState(false);
  const [customer, setCustomer] = useState(() => getInitialCustomer(initialCustomer));
  const initialCustomerHadAddress = useRef(Boolean(initialCustomer?.address));
  const isAuthenticated = Boolean(currentUser);
  const productsById = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products]
  );

  useEffect(() => {
    const sanitizedItems = sanitizeCartItems(readStoredCart(), products);
    setCartItems(sanitizedItems);
    setHasLoadedCart(true);
    writeStoredCart(sanitizedItems);
  }, [products]);

  useEffect(() => {
    if (hasLoadedCart) {
      writeStoredCart(cartItems);
    }
  }, [cartItems, hasLoadedCart]);

  useEffect(() => {
    const cepDigits = getCepDigits(customer.cep);

    if (cepDigits.length !== 8) {
      setCepLookup({ message: "", status: "idle" });
      return;
    }

    if (!cepWasEdited && initialCustomerHadAddress.current) {
      return;
    }

    const controller = new AbortController();

    setCepLookup({ message: "Buscando endereco pelo CEP...", status: "loading" });

    fetchCepAddress(customer.cep, { signal: controller.signal })
      .then((address) => {
        if (!address) {
          setAutoFilledAddressLine("");
          setCepLookup({
            message: "CEP nao encontrado. Confira o numero ou preencha o endereco manualmente.",
            status: "error"
          });
          return;
        }

        const addressLine = formatCepAddressLine(address);

        setCustomer((currentCustomer) => {
          if (getCepDigits(currentCustomer.cep) !== cepDigits) {
            return currentCustomer;
          }

          return {
            ...currentCustomer,
            address: addressLine || currentCustomer.address
          };
        });
        setAutoFilledAddressLine(addressLine);
        setCepLookup({
          message: "Endereco preenchido pelo CEP. Complete com numero e complemento.",
          status: "success"
        });
      })
      .catch((error) => {
        if (error?.name === "AbortError") {
          return;
        }

        setAutoFilledAddressLine("");
        setCepLookup({
          message: "Nao foi possivel consultar o CEP agora. Preencha o endereco manualmente.",
          status: "error"
        });
      });

    return () => controller.abort();
  }, [cepWasEdited, customer.cep]);

  const totals = useMemo(
    () => calculateCartTotals(cartItems, shippingOptionId),
    [cartItems, shippingOptionId]
  );
  const customerFieldErrors = useMemo(
    () =>
      validateCustomerFieldFormats({
        cep: customer.cep,
        phone: customer.phone,
        taxId: customer.taxId,
        whatsapp: customer.whatsapp
      }),
    [customer.cep, customer.phone, customer.taxId, customer.whatsapp]
  );
  const hasAutoFilledAddressPendingEdit = Boolean(
    autoFilledAddressLine && customer.address.trim() === autoFilledAddressLine.trim()
  );
  const hasRequiredCustomerData = Boolean(
    customer.name &&
      (customer.whatsapp || customer.phone) &&
      customer.cep &&
      customer.address &&
      !hasAutoFilledAddressPendingEdit
  );
  const canCheckout =
    cartItems.length > 0 &&
    hasDataConsent &&
    hasRequiredCustomerData &&
    customerFieldErrors.length === 0;
  const whatsappMessage = useMemo(
    () =>
      buildWhatsAppOrderMessage({
        cartItems,
        customer,
        paymentMethodId,
        shippingOptionId,
        storeName
      }),
    [cartItems, customer, paymentMethodId, shippingOptionId]
  );

  function updateQuantity(cartKey, nextQuantity) {
    setCartItems((currentItems) => updateCartItemQuantity(currentItems, cartKey, nextQuantity));
  }

  function updateVariation(cartKey, nextVariation) {
    setCartItems((currentItems) =>
      updateCartItemVariation(currentItems, products, cartKey, nextVariation)
    );
  }

  function deleteItem(cartKey) {
    setCartItems((currentItems) => removeCartItem(currentItems, cartKey));
  }

  function updateCustomer(field, value) {
    setCustomer((currentCustomer) => ({
      ...currentCustomer,
      [field]: value
    }));
  }

  function updateCep(value) {
    const cep = sanitizeCep(value);

    setCepWasEdited(true);
    setCustomer((currentCustomer) => {
      const shouldClearAddress =
        autoFilledAddressLine &&
        currentCustomer.address.trim() === autoFilledAddressLine.trim();

      return {
        ...currentCustomer,
        address: shouldClearAddress ? "" : currentCustomer.address,
        cep
      };
    });
    setAutoFilledAddressLine("");
  }

  async function submitCheckout() {
    if (!canCheckout || isSubmittingCheckout) {
      if (customerFieldErrors.length > 0) {
        setCheckoutFeedback(customerFieldErrors[0]);
      }

      return;
    }

    setCheckoutFeedback("");
    setIsSubmittingCheckout(true);

    try {
      const response = await fetch("/api/checkout/whatsapp", {
        body: JSON.stringify({
          cartItems,
          customer,
          hasDataConsent,
          paymentMethodId,
          shippingOptionId
        }),
        headers: {
          "Content-Type": "application/json"
        },
        method: "POST"
      });
      const data = await response.json();

      if (!response.ok) {
        const details = Array.isArray(data.details) ? data.details.join(" ") : "";
        throw new Error([data.error, details].filter(Boolean).join(" "));
      }

      if (!data.whatsappUrl) {
        throw new Error("Numero do WhatsApp Business nao configurado.");
      }

      if (data.order?.saved && data.order?.orderNumber) {
        setCheckoutFeedback(`Pedido ${data.order.orderNumber} salvo. Abrindo WhatsApp.`);
      } else if (data.order?.reason) {
        setCheckoutFeedback(`Mensagem pronta. ${data.order.reason}`);
      } else {
        setCheckoutFeedback("Mensagem pronta. Abrindo WhatsApp.");
      }

      clearStoredCart();
      setCartItems([]);
      window.open(data.whatsappUrl, "_blank", "noopener,noreferrer");
    } catch (error) {
      setCheckoutFeedback(
        error instanceof Error
          ? error.message
          : "Nao foi possivel finalizar o pedido agora."
      );
    } finally {
      setIsSubmittingCheckout(false);
    }
  }

  return (
    <>
      <StoreHeader currentUser={currentUser} showSearch={false} />

      <section className="cart-heading">
        <div>
          <p className="section-label">Carrinho de compra</p>
          <h1>Revise os itens e finalize o pedido em uma tela separada.</h1>
        </div>
        <Link className="button button-secondary" href="/">
          Continuar comprando
        </Link>
      </section>

      <section className="cart-page-layout">
        <div className="cart-items-panel">
          <div className="panel-heading">
            <h2>Itens no carrinho</h2>
            <strong>{formatCurrency(totals.subtotalCents)}</strong>
          </div>

          {!hasLoadedCart ? (
            <p className="empty-copy">Carregando carrinho...</p>
          ) : cartItems.length === 0 ? (
            <div className="empty-cart">
              <p>Seu carrinho ainda esta vázio.</p>
              <Link className="button button-primary" href="/">
                Ver produtos
              </Link>
            </div>
          ) : (
            <div className="cart-line-list">
              {cartItems.map((item) => {
                const product = productsById.get(item.id);
                const canChangeVariation = product?.variations?.length > 1;

                return (
                  <article className="cart-line" key={item.cartKey}>
                    <div className={`cart-line-image family-${item.productFamily}`}>
                      {item.name
                        .split(/\s+/)
                        .slice(0, 2)
                        .map((part) => part[0])
                        .join("")
                        .toUpperCase()}
                    </div>
                    <div className="cart-line-detail">
                      <strong>{item.name}</strong>
                      {canChangeVariation ? (
                        <label className="cart-line-variation">
                          <span>Variacao</span>
                          <select
                            onChange={(event) => updateVariation(item.cartKey, event.target.value)}
                            value={item.variation}
                          >
                            {product.variations.map((variation) => (
                              <option key={variation} value={variation}>
                                {variation}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : (
                        <span>{item.variation}</span>
                      )}
                    </div>
                    <div className="cart-line-controls">
                      <div className="quantity-control" aria-label={`Quantidade de ${item.name}`}>
                        <button
                          aria-label={`Remover uma unidade de ${item.name}`}
                          onClick={() => updateQuantity(item.cartKey, item.quantity - 1)}
                          type="button"
                        >
                          -
                        </button>
                        <span>{item.quantity}</span>
                        <button
                          aria-label={`Adicionar uma unidade de ${item.name}`}
                          onClick={() => updateQuantity(item.cartKey, item.quantity + 1)}
                          type="button"
                        >
                          +
                        </button>
                      </div>
                      <button
                        className="cart-line-delete"
                        onClick={() => deleteItem(item.cartKey)}
                        type="button"
                      >
                        Excluir
                      </button>
                    </div>
                    <strong>{formatCurrency(item.priceCents * item.quantity)}</strong>
                  </article>
                );
              })}
            </div>
          )}
        </div>

        <aside className="cart-summary-panel">
          <div className="checkout-header">
            <p className="section-label">Resumo do pedido</p>
            <h2>{formatCurrency(totals.totalCents)}</h2>
          </div>

          {!isAuthenticated ? (
            <div className="account-nudge">
              <strong>Compre mais rapido</strong>
              <span>Crie conta para salvar dados de entrega e preencher o checkout.</span>
              <Link href={isSupabaseConfigured ? "/cadastrar" : "/conta"}>Cadastrar cliente</Link>
            </div>
          ) : (
            <div className="account-nudge is-signed">
              <strong>Dados da sua conta carregados</strong>
              <span>Você pode editar qualquer campo antes de enviar ao atendimento.</span>
            </div>
          )}

          <div className="checkout-form">
            <label>
              <span>Nome <span className="required-field-mark" aria-hidden="true">*</span></span>
              <input
                onChange={(event) => updateCustomer("name", event.target.value)}
                placeholder="Nome do cliente"
                required
                value={customer.name}
              />
            </label>
            <label>
              <span>CPF/CNPJ</span>
              <input
                inputMode="numeric"
                onChange={(event) => updateCustomer("taxId", sanitizeTaxId(event.target.value))}
                pattern={taxIdPattern}
                placeholder="Opcional quando nao exigido"
                title="Use somente numeros, pontos, barra e hifen."
                value={customer.taxId}
              />
            </label>
            <label>
              <span>Email</span>
              <input
                onChange={(event) => updateCustomer("email", event.target.value)}
                placeholder="você@email.com"
                type="email"
                value={customer.email}
              />
            </label>
            <label>
              <span>
                WhatsApp ou telefone <span className="required-field-mark" aria-hidden="true">*</span>
              </span>
              <input
                aria-required="true"
                inputMode="tel"
                onChange={(event) => updateCustomer("whatsapp", sanitizePhone(event.target.value))}
                pattern={phonePattern}
                placeholder="(00) 00000-0000"
                title="Use somente numeros e pontuação de telefone."
                value={customer.whatsapp}
              />
            </label>
            <label>
              <span>Telefone opcional</span>
              <input
                inputMode="tel"
                onChange={(event) => updateCustomer("phone", sanitizePhone(event.target.value))}
                pattern={phonePattern}
                placeholder="Telefone alternativo"
                title="Use somente numeros e pontuação de telefone."
                value={customer.phone}
              />
            </label>
            <label>
              <span>CEP <span className="required-field-mark" aria-hidden="true">*</span></span>
              <input
                inputMode="numeric"
                onChange={(event) => updateCep(event.target.value)}
                pattern={cepPattern}
                placeholder="00000-000"
                required
                title="Use 8 numeros, com ou sem hifen."
                value={customer.cep}
              />
            </label>
            {cepLookup.message ? (
              <p
                aria-live="polite"
                className="checkout-note span-all"
                role={cepLookup.status === "error" ? "alert" : "status"}
              >
                {cepLookup.message}
              </p>
            ) : null}
            <label className="span-all">
              <span>
                Endereço completo <span className="required-field-mark" aria-hidden="true">*</span>
              </span>
              <input
                onChange={(event) => updateCustomer("address", event.target.value)}
                placeholder="Rua, numero, bairro, cidade/UF"
                required
                value={customer.address}
              />
            </label>
            <label>
              <span>Pagamento</span>
              <select
                onChange={(event) => setPaymentMethodId(event.target.value)}
                value={paymentMethodId}
              >
                {paymentMethods.map((paymentMethod) => (
                  <option key={paymentMethod.id} value={paymentMethod.id}>
                    {paymentMethod.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Frete</span>
              <select
                onChange={(event) => setShippingOptionId(event.target.value)}
                value={shippingOptionId}
              >
                {shippingOptions.map((shippingOption) => (
                  <option key={shippingOption.id} value={shippingOption.id}>
                    {shippingOption.label} - {formatCurrency(shippingOption.priceCents)}
                  </option>
                ))}
              </select>
            </label>
            <label className="span-all">
              <span>Observacoes</span>
              <textarea
                onChange={(event) => updateCustomer("notes", event.target.value)}
                placeholder="Cor, urgencia, duvida ou combinação especial"
                value={customer.notes}
              />
            </label>
            <label className="consent-box span-all">
              <input
                checked={hasDataConsent}
                onChange={(event) => setHasDataConsent(event.target.checked)}
                required
                type="checkbox"
              />
              <span>
                {ASSISTED_PURCHASE_CONSENT_TEXT}{" "}
                <span className="required-field-mark" aria-hidden="true">*</span>
              </span>
            </label>
          </div>

          <div className="total-box">
            <span>Subtotal</span>
            <strong>{formatCurrency(totals.subtotalCents)}</strong>
            <span>Frete</span>
            <strong>{formatCurrency(totals.shippingCents)}</strong>
            <span>Total</span>
            <strong>{formatCurrency(totals.totalCents)}</strong>
          </div>

          <textarea className="message-preview" readOnly value={whatsappMessage} />

          <p className="checkout-note">
            {cartItems.length === 0
              ? "Adicione pelo menos um item para liberar o envio."
              : hasAutoFilledAddressPendingEdit
                ? "Complete o endereco com numero antes de enviar."
              : !hasRequiredCustomerData
                ? "Preencha nome, WhatsApp, CEP e endereço para enviar."
                : customerFieldErrors.length > 0
                  ? customerFieldErrors[0]
                : hasDataConsent
                  ? "Pedido pronto para enviar ao atendimento."
                  : "Confirme o aceite de dados para liberar o envio."}
          </p>

          {checkoutFeedback ? <p className="checkout-note">{checkoutFeedback}</p> : null}

          <button
            className={`button button-success checkout-button ${
              !canCheckout || isSubmittingCheckout ? "is-disabled" : ""
            }`}
            disabled={!canCheckout || isSubmittingCheckout}
            onClick={submitCheckout}
            type="button"
          >
            {isSubmittingCheckout ? "Salvando pedido..." : "Enviar pedido no WhatsApp"}
          </button>
        </aside>
      </section>
    </>
  );
}
