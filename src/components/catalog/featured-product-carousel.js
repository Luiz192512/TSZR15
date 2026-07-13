"use client";

import globalStyles from "@/app/storefront.module.css";
import { cx } from "@/src/lib/classnames";
import Link from "next/link";
import { useState } from "react";

import { formatCurrency } from "@/src/checkout/whatsapp.js";
import {
  ChevronIcon,
  getProductFamilyLabel,
  getProductHref,
  getProductSummary,
  ProductVisual
} from "./catalog-shared.js";
import { InfiniteProductRail } from "./infinite-product-rail.js";

export function FeaturedProductCarousel({ featuredProducts = [] }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const activeProduct = featuredProducts[activeIndex] ?? featuredProducts[0];

  if (!activeProduct) {
    return null;
  }

  function goToPrevious() {
    setActiveIndex((currentIndex) =>
      currentIndex === 0 ? featuredProducts.length - 1 : currentIndex - 1
    );
  }

  function goToNext() {
    setActiveIndex((currentIndex) =>
      currentIndex === featuredProducts.length - 1 ? 0 : currentIndex + 1
    );
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
          <button aria-label="Próximo produto" onClick={goToNext} type="button">
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

      <InfiniteProductRail products={featuredProducts} />
    </div>
  );
}
