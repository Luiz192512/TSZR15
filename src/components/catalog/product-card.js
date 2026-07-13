import globalStyles from "@/app/storefront.module.css";
import { formatCategoryLabels } from "@/src/catalog/categories.js";
import {
  getProductCode,
  getProductFamilyLabel,
  getProductHref,
  getProductSummary,
  getProductVisualImage
} from "@/src/catalog/product-presentation.js";
import { formatCurrency } from "@/src/checkout/whatsapp.js";
import { cx } from "@/src/lib/classnames";
import Image from "next/image";
import Link from "next/link";

const brandLogoSrc = "/brand/logo-tszr15-store.webp";

function ProductCardVisual({ product }) {
  const categoryLabel = formatCategoryLabels(product.storefrontCategoryIds)[0] ?? "R15";
  const familyClass = `family-${product.productFamily}`;
  const coverImage = getProductVisualImage(product);

  return (
    <div
      className={cx(
        globalStyles,
        `product-image product-image-card ${familyClass} ${coverImage ? "has-product-photo" : ""}`
      )}
    >
      {coverImage ? (
        <Image
          alt={product.name}
          className={cx(globalStyles, "product-photo")}
          fill
          loading="lazy"
          sizes="(max-width: 720px) 92vw, 366px"
          src={coverImage}
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

export function ProductCard({ product }) {
  const categoryLabels = formatCategoryLabels(product.storefrontCategoryIds);

  return (
    <Link className={cx(globalStyles, "hub-product-card")} href={getProductHref(product)}>
      <ProductCardVisual product={product} />

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
