"use client";

import globalStyles from "@/app/storefront.module.css";
import { cx } from "@/src/lib/classnames";
import Image from "next/image";
import Link from "next/link";

import { getProductVisualImage } from "./catalog-shared.js";
import { getVariationStockStatus } from "@/src/catalog/stock.js";
import { formatCurrency } from "@/src/checkout/whatsapp.js";
import styles from "./cart-items-panel.module.css";

export function CartItemsPanel({
  cartItems,
  hasLoadedCart,
  onDelete,
  onQuantity,
  onVariation,
  productsById,
  subtotalCents,
  syncFeedback
}) {
  return (
    <div className={cx(globalStyles, styles.panel)}>
      <div className={cx(globalStyles, styles.heading)}>
        <h2>Itens no carrinho</h2>
        <strong>{formatCurrency(subtotalCents)}</strong>
      </div>
      {syncFeedback ? (
        <p className={cx(globalStyles, styles.syncNotice)} role="status">
          {syncFeedback}
        </p>
      ) : null}

      {!hasLoadedCart ? (
        <div className={cx(globalStyles, styles.loader)}>
          <span aria-hidden="true" className={cx(globalStyles, "button-loader")} />
          <p>Carregando carrinho...</p>
        </div>
      ) : cartItems.length === 0 ? (
        <div className={cx(globalStyles, styles.empty)}>
          <p>Seu carrinho ainda está vazio.</p>
          <Link className={cx(globalStyles, "button button-primary")} href="/">
            Ver produtos
          </Link>
        </div>
      ) : (
        <div className={cx(globalStyles, styles.list)}>
          {cartItems.map((item) => {
            const product = productsById.get(item.id);
            const stock = getVariationStockStatus(product, item.variation);
            const canChangeVariation = product?.variations?.length > 1;
            const imageUrl = product ? getProductVisualImage(product) : "";

            return (
              <article className={cx(globalStyles, styles.line)} key={item.cartKey}>
                <div className={cx(globalStyles, `${styles.image} family-${item.productFamily}`)}>
                  {imageUrl ? (
                    <Image
                      alt={item.name}
                      className={cx(globalStyles, styles.photo)}
                      fill
                      sizes="82px"
                      src={imageUrl}
                    />
                  ) : (
                    item.name
                      .split(/\s+/)
                      .slice(0, 2)
                      .map((part) => part[0])
                      .join("")
                      .toUpperCase()
                  )}
                </div>
                <div className={cx(globalStyles, styles.detail)}>
                  <strong>{item.name}</strong>
                  {canChangeVariation ? (
                    <label className={cx(globalStyles, styles.variation)}>
                      <span>Variação</span>
                      <select
                        onChange={(event) => onVariation(item.cartKey, event.target.value)}
                        value={item.variation}
                      >
                        {product.variations.map((variation) => {
                          const stock = getVariationStockStatus(product, variation);

                          return (
                            <option
                              disabled={!stock.canAddToCart}
                              key={variation}
                              value={variation}
                            >
                              {stock.canAddToCart ? variation : `${variation} — esgotado`}
                            </option>
                          );
                        })}
                      </select>
                    </label>
                  ) : (
                    <span>{item.variation}</span>
                  )}
                </div>
                <div className={cx(globalStyles, styles.controls)}>
                  <div
                    className={cx(globalStyles, "quantity-control")}
                    aria-label={`Quantidade de ${item.name}`}
                  >
                    <button
                      aria-label={`Remover uma unidade de ${item.name}`}
                      onClick={() => onQuantity(item.cartKey, item.quantity - 1)}
                      type="button"
                    >
                      -
                    </button>
                    <span>{item.quantity}</span>
                    <button
                      aria-label={`Adicionar uma unidade de ${item.name}`}
                      disabled={stock.quantity !== null && item.quantity >= stock.quantity}
                      onClick={() => onQuantity(item.cartKey, item.quantity + 1)}
                      type="button"
                    >
                      +
                    </button>
                  </div>
                  <button
                    aria-label={`Excluir ${item.name} do carrinho`}
                    className={cx(globalStyles, styles.delete)}
                    onClick={() => onDelete(item.cartKey)}
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
  );
}
