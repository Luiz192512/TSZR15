"use client";

import globalStyles from "@/app/storefront.module.css";
import { cx } from "@/src/lib/classnames";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

import { formatCategoryLabels } from "@/src/catalog/categories.js";
import {
  getFeaturedProducts,
  getProductCode,
  getProductFamilyLabel,
  getProductHref,
  getProductImages,
  getProductSummary,
  getProductVariationImage,
  getProductVisualImage
} from "@/src/catalog/product-presentation.js";
import { formatCurrency } from "@/src/checkout/whatsapp.js";
import { CartIcon } from "@/src/components/cart-icon.js";
import {
  cartChangedEventName,
  clearStoredCart,
  guestCartStorageKey,
  migrateGuestCartToUser,
  readStoredCart,
  writeStoredCart
} from "@/src/cart/cart-storage.js";
export const storeName = process.env.NEXT_PUBLIC_STORE_NAME ?? "TSZR15";
export const cartStorageKey = guestCartStorageKey;
export const brandLogoSrc = "/brand/logo-tszr15-store.webp";
export const heroBoardSrc = "/brand/tszr15-hero-r15-dark.webp";

export { clearStoredCart, migrateGuestCartToUser, readStoredCart, writeStoredCart };

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

export function normalizeSearch(value) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

export {
  getFeaturedProducts,
  getProductCode,
  getProductFamilyLabel,
  getProductHref,
  getProductImages,
  getProductSummary,
  getProductVariationImage,
  getProductVisualImage
};

export function getInitialCustomer(initialCustomer) {
  return {
    ...emptyCustomer,
    ...(initialCustomer ?? {})
  };
}

export function getCartCount(items) {
  return items.reduce((total, item) => total + item.quantity, 0);
}

export function useCartCount(userId) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    function refreshCount() {
      setCount(getCartCount(readStoredCart(userId)));
    }

    refreshCount();
    window.addEventListener("storage", refreshCount);
    window.addEventListener(cartChangedEventName, refreshCount);

    return () => {
      window.removeEventListener("storage", refreshCount);
      window.removeEventListener(cartChangedEventName, refreshCount);
    };
  }, [userId]);

  return count;
}

function DeferredAccountNavLink({
  authenticatedClassName = "profile-link",
  resolveAccount = true,
  unauthenticatedClassName = "nav-link nav-link-auth",
  user,
  variant = "icon"
}) {
  const [AccountNavLinkComponent, setAccountNavLinkComponent] = useState(null);
  const [shouldResolveAccount, setShouldResolveAccount] = useState(Boolean(user));

  useEffect(() => {
    if (!resolveAccount || user || shouldResolveAccount || typeof window === "undefined") {
      return undefined;
    }

    if ("requestIdleCallback" in window) {
      const idleId = window.requestIdleCallback(() => setShouldResolveAccount(true), {
        timeout: 6000
      });

      return () => window.cancelIdleCallback(idleId);
    }

    const timeoutId = window.setTimeout(() => setShouldResolveAccount(true), 3500);

    return () => window.clearTimeout(timeoutId);
  }, [resolveAccount, shouldResolveAccount, user]);

  useEffect(() => {
    if (!shouldResolveAccount || AccountNavLinkComponent) {
      return undefined;
    }

    let isMounted = true;

    import("@/src/components/account-nav-link.js").then((module) => {
      if (isMounted) {
        setAccountNavLinkComponent(() => module.AccountNavLink);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [AccountNavLinkComponent, shouldResolveAccount]);

  if (AccountNavLinkComponent) {
    return (
      <AccountNavLinkComponent
        authenticatedClassName={authenticatedClassName}
        unauthenticatedClassName={unauthenticatedClassName}
        user={user}
        variant={variant}
      />
    );
  }

  return (
    <Link
      className={cx(globalStyles, unauthenticatedClassName)}
      data-auth-loading="true"
      href="/entrar"
    >
      Entrar
    </Link>
  );
}

export function ProductVisual({ priority = false, product, size = "card" }) {
  const categoryLabel = formatCategoryLabels(product.storefrontCategoryIds)[0] ?? "R15";
  const familyClass = `family-${product.productFamily}`;
  const coverImage = getProductVisualImage(product, size);
  const [imageFailed, setImageFailed] = useState(false);

  // Se a URL mudar (componente reutilizado em outro produto), limpa o estado de
  // falha para nao esconder uma imagem valida.
  useEffect(() => {
    setImageFailed(false);
  }, [coverImage]);

  const showPhoto = Boolean(coverImage) && !imageFailed;
  const imageLoadingProps = priority
    ? { fetchPriority: "high", priority: true }
    : { loading: "lazy" };

  return (
    <div
      className={cx(
        globalStyles,
        `product-image product-image-${size} ${familyClass} ${
          showPhoto ? "has-product-photo" : ""
        }`
      )}
    >
      {showPhoto ? (
        <Image
          alt={product.name}
          className={cx(globalStyles, "product-photo")}
          fill
          onError={() => setImageFailed(true)}
          sizes={productImageSizes[size] ?? productImageSizes.card}
          src={coverImage}
          {...imageLoadingProps}
        />
      ) : (
        <>
          <Image
            alt=""
            aria-hidden="true"
            className={cx(globalStyles, "product-image-logo")}
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
        strokeWidth="2"
      />
    </svg>
  );
}

export function ReviewStars({ rating = 0 }) {
  return (
    <span className={cx(globalStyles, "review-stars")} aria-label={`${rating} de 5 estrelas`}>
      {Array.from({ length: 5 }).map((_, index) => (
        <span
          className={cx(globalStyles, index < Math.round(rating) ? "is-filled" : "")}
          key={index}
        >
          {"\u2605"}
        </span>
      ))}
    </span>
  );
}

export function StoreHeader({
  currentUser,
  onSearchChange,
  query = "",
  resolveAccount = true,
  showSearch = true
}) {
  const cartCount = useCartCount(currentUser?.id);

  return (
    <header
      className={cx(globalStyles, `store-header ${showSearch ? "" : "store-header-compact"}`)}
    >
      <div className={cx(globalStyles, "store-header-top")}>
        <Link className={cx(globalStyles, "store-brand")} href="/">
          <Image
            alt="TSZ Store"
            className={cx(globalStyles, "store-logo-image")}
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

        <div className={cx(globalStyles, "mobile-nav-actions")}>
          <Link
            aria-label={`Carrinho ${cartCount} ${cartCount === 1 ? "item" : "itens"} - abrir pedido`}
            className={cx(globalStyles, "cart-nav-link mobile-cart-link")}
            href="/pedido"
          >
            <CartIcon />
            <span className={cx(globalStyles, "sr-only")}>Carrinho</span>
            <span aria-hidden="true" className={cx(globalStyles, "cart-count-badge")}>
              {cartCount}
            </span>
          </Link>
          <details className={cx(globalStyles, "mobile-nav-details")}>
            <summary
              className={cx(globalStyles, "mobile-menu-button")}
              aria-label="Abrir menu da loja"
            >
              Menu
              <span aria-hidden="true" className={cx(globalStyles, "mobile-menu-icon")} />
            </summary>
            <nav className={cx(globalStyles, "mobile-nav-panel")} aria-label="Menu mobile da loja">
              <Link href="/">Início</Link>
              <Link href="/catalogo">Produtos</Link>
              <Link href="/#lancamentos">Lançamentos</Link>
              <Link href="/rastreio">Rastreio</Link>
              <DeferredAccountNavLink
                authenticatedClassName=""
                resolveAccount={resolveAccount}
                unauthenticatedClassName=""
                user={currentUser}
                variant="text"
              />
            </nav>
          </details>
        </div>
      </div>

      {showSearch ? (
        <label className={cx(globalStyles, "store-search")} htmlFor="catalog-search">
          <span>Buscar</span>
          <input
            id="catalog-search"
            onChange={(event) => onSearchChange?.(event.target.value)}
            placeholder="Escapamentos, sliders, manetes..."
            value={query}
          />
        </label>
      ) : null}

      <nav className={cx(globalStyles, "store-nav")} aria-label="Navegação principal">
        <Link href="/">Início</Link>
        <Link href="/catalogo">Produtos</Link>
        <Link href="/#lancamentos">Lançamentos</Link>
        <Link
          aria-label={`Carrinho ${cartCount} ${cartCount === 1 ? "item" : "itens"} - abrir pedido`}
          className={cx(globalStyles, "cart-nav-link")}
          href="/pedido"
        >
          <CartIcon />
          <span className={cx(globalStyles, "sr-only")}>Carrinho</span>
          <span aria-hidden="true" className={cx(globalStyles, "cart-count-badge")}>
            {cartCount}
          </span>
        </Link>
        <DeferredAccountNavLink
          authenticatedClassName="profile-link store-profile-link desktop-account-link"
          resolveAccount={resolveAccount}
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
    <Link className={cx(globalStyles, "hub-product-card")} href={getProductHref(product)}>
      <ProductVisual product={product} />

      <div className={cx(globalStyles, "hub-product-copy")}>
        <div className={cx(globalStyles, "badge-row")}>
          <span className={cx(globalStyles, "badge badge-category")}>
            {categoryLabels[0] ?? "R15"}
          </span>
          <span className={cx(globalStyles, "badge badge-family")}>
            {getProductFamilyLabel(product.productFamily)}
          </span>
        </div>

        <h2>{product.name}</h2>
        <p>{getProductSummary(product)}</p>

        <div className={cx(globalStyles, "card-price-row")}>
          <strong>{formatCurrency(product.priceCents)}</strong>
          <span>Ver detalhes</span>
        </div>
      </div>
    </Link>
  );
}
