"use client";

import Link from "next/link";

import { cx } from "@/src/lib/classnames";
import { formatCurrency } from "@/src/checkout/whatsapp.js";
import { getProductHref, ProductVisual } from "./catalog-shared.js";
import styles from "./infinite-product-rail.module.css";

function RailCard({ ariaHidden = false, product }) {
  return (
    <Link
      aria-hidden={ariaHidden || undefined}
      className={cx(styles, "card")}
      href={getProductHref(product)}
      tabIndex={ariaHidden ? -1 : undefined}
    >
      <div className={cx(styles, "visual")}>
        <ProductVisual product={product} size="card" />
      </div>
      <span className={cx(styles, "name")}>{product.name}</span>
      <strong className={cx(styles, "price")}>{formatCurrency(product.priceCents)}</strong>
    </Link>
  );
}

// Trilho horizontal com rolagem continua (marquee). A lista e duplicada para
// o loop fechar sem emenda; a copia fica aria-hidden e fora da tabulacao.
// Pausa em hover/focus e desliga com prefers-reduced-motion (vira scroll).
export function InfiniteProductRail({ products }) {
  if (!products || products.length === 0) {
    return null;
  }

  return (
    <div className={cx(styles, "rail")}>
      <div className={cx(styles, "track")}>
        {products.map((product) => (
          <RailCard key={product.id} product={product} />
        ))}
        {products.map((product) => (
          <RailCard ariaHidden key={`clone-${product.id}`} product={product} />
        ))}
      </div>
    </div>
  );
}
