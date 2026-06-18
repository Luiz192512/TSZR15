"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

import { formatCategoryLabels } from "@/src/catalog/index.js";
import { getProductImageVariants } from "@/src/catalog/image-variants.js";
import { formatCurrency } from "@/src/checkout/whatsapp.js";
import { AccountNavLink } from "@/src/components/account-nav-link.js";
import { CartIcon } from "@/src/components/cart-icon.js";
export const storeName = process.env.NEXT_PUBLIC_STORE_NAME ?? "TSZR15";
export const cartStorageKey = "tszr15-cart";
export const brandLogoSrc = "/brand/logo-tszr15-store.png";
export const heroBoardSrc =
  "https://mckthvbwddxipghumrpw.supabase.co/storage/v1/object/public/brand-assets/tszr15-hero-r15-dark.png";

const featuredProductIds = [
  "escapamento-sc-project-completo",
  "kit-suporte-slider",
  "kit-manete-manopla-pesinho",
  "bolha-esportiva",
  "farol-led-drl-predator-eye",
  "protetor-de-radiador-aluminio"
];

const productImageSizes = {
  card: "(max-width: 720px) 92vw, 366px",
  detail: "(max-width: 720px) 92vw, 650px",
  feature: "(max-width: 620px) 325px, (max-width: 920px) 460px, 460px"
};

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

export function normalizeSearch(value) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

export function getProductCode(product) {
  return product.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export function getProductFamilyLabel(productFamily) {
  return familyLabels[productFamily] ?? String(productFamily ?? "").replaceAll("_", " ");
}

export function getProductSummary(product) {
  return (
    product.notes || familySummaries[product.productFamily] || "Produto curado para Yamaha R15."
  );
}

export function getInitialCustomer(initialCustomer) {
  return {
    ...emptyCustomer,
    ...(initialCustomer ?? {})
  };
}

export function getProductHref(product) {
  return `/produto/${product.slug}`;
}

export function getProductImages(product) {
  return Array.isArray(product.imageUrls)
    ? product.imageUrls.filter((imageUrl) => typeof imageUrl === "string" && imageUrl.trim())
    : [];
}

export function getProductVisualImage(product, size = "card") {
  const [coverImage] = getProductImages(product);
  const variants = getProductImageVariants(coverImage);

  return size === "card" ? variants.card : variants.detail;
}

export function getFeaturedProducts(products) {
  const productsById = new Map(products.map((product) => [product.id, product]));
  const selectedProducts = featuredProductIds
    .map((productId) => productsById.get(productId))
    .filter(Boolean);
  const selectedIds = new Set(selectedProducts.map((product) => product.id));
  const fallbackProducts = products.filter((product) => !selectedIds.has(product.id));

  return [...selectedProducts, ...fallbackProducts].slice(0, 8);
}

export function readStoredCart() {
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

export function writeStoredCart(items) {
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

export function clearStoredCart() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(cartStorageKey);
  window.dispatchEvent(new Event("tszr15-cart-changed"));
}

export function getCartCount(items) {
  return items.reduce((total, item) => total + item.quantity, 0);
}

export function useCartCount() {
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

export function ProductVisual({ priority = false, product, size = "card" }) {
  const categoryLabel = formatCategoryLabels(product.storefrontCategoryIds)[0] ?? "R15";
  const familyClass = `family-${product.productFamily}`;
  const coverImage = getProductVisualImage(product, size);
  const imageLoadingProps = priority
    ? { fetchPriority: "high", priority: true }
    : { loading: "lazy" };

  return (
    <div
      className={`product-image product-image-${size} ${familyClass} ${
        coverImage ? "has-product-photo" : ""
      }`}
    >
      {coverImage ? (
        <Image
          alt={product.name}
          className="product-photo"
          fill
          sizes={productImageSizes[size] ?? productImageSizes.card}
          src={coverImage}
          {...imageLoadingProps}
        />
      ) : (
        <>
          <Image
            alt=""
            aria-hidden="true"
            className="product-image-logo"
            height={2000}
            sizes="120px"
            src={brandLogoSrc}
            width={2000}
          />
          <span>{categoryLabel}</span>
          <strong>{getProductCode(product)}</strong>
        </>
      )}
    </div>
  );
}

export function ChevronIcon({ direction }) {
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

export function ReviewStars({ rating = 0 }) {
  return (
    <span className="review-stars" aria-label={`${rating} de 5 estrelas`}>
      {Array.from({ length: 5 }).map((_, index) => (
        <span className={index < Math.round(rating) ? "is-filled" : ""} key={index}>
          {"\u2605"}
        </span>
      ))}
    </span>
  );
}

export function StoreHeader({ currentUser, onSearchChange, query = "", showSearch = true }) {
  const cartCount = useCartCount();

  return (
    <header className={`store-header ${showSearch ? "" : "store-header-compact"}`}>
      <div className="store-header-top">
        <Link className="store-brand" href="/">
          <Image
            alt="TSZ Store"
            className="store-logo-image"
            height={2000}
            sizes="154px"
            src={brandLogoSrc}
            width={2000}
          />
          <span>
            <strong>TSZR15</strong>
            <small>Performance parts R15</small>
          </span>
        </Link>

        <div className="mobile-nav-actions">
          <Link
            aria-label={`Carrinho ${cartCount} ${cartCount === 1 ? "item" : "itens"} - abrir pedido`}
            className="cart-nav-link mobile-cart-link"
            href="/pedido"
          >
            <CartIcon />
            <span className="sr-only">Carrinho</span>
            <span aria-hidden="true" className="cart-count-badge">
              {cartCount}
            </span>
          </Link>
          <details className="mobile-nav-details">
            <summary className="mobile-menu-button" aria-label="Abrir menu da loja">
              Menu
              <span aria-hidden="true" className="mobile-menu-icon" />
            </summary>
            <nav className="mobile-nav-panel" aria-label="Menu mobile da loja">
              <Link href="/">Inicio</Link>
              <Link href="/catalogo#produtos">Produtos</Link>
              <Link href="/#lancamentos">Lancamentos</Link>
              <Link href="/#sobre">Sobre nos</Link>
              <Link href="/rastreio">Rastreio</Link>
              <AccountNavLink
                authenticatedClassName=""
                unauthenticatedClassName=""
                user={currentUser}
                variant="text"
              />
            </nav>
          </details>
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

      <nav className="store-nav" aria-label="Navegacao principal">
        <Link href="/">Inicio</Link>
        <Link href="/catalogo#produtos">Produtos</Link>
        <Link href="/#lancamentos">Lancamentos</Link>
        <Link href="/#sobre">Sobre nos</Link>
        <Link
          aria-label={`Carrinho ${cartCount} ${cartCount === 1 ? "item" : "itens"} - abrir pedido`}
          className="cart-nav-link"
          href="/pedido"
        >
          <CartIcon />
          <span className="sr-only">Carrinho</span>
          <span aria-hidden="true" className="cart-count-badge">
            {cartCount}
          </span>
        </Link>
        <AccountNavLink
          authenticatedClassName="profile-link store-profile-link desktop-account-link"
          unauthenticatedClassName="button button-secondary"
          user={currentUser}
        />
      </nav>
    </header>
  );
}
export function ProductCard({ product }) {
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
