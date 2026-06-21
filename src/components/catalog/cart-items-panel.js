"use client";

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
    <div className={styles.panel}>
      <div className={styles.heading}>
        <h2>Itens no carrinho</h2>
        <strong>{formatCurrency(subtotalCents)}</strong>
      </div>
      {syncFeedback ? (
        <p className={styles.syncNotice} role="status">
          {syncFeedback}
        </p>
      ) : null}

      {!hasLoadedCart ? (
        <div className={styles.loader}>
          <span aria-hidden="true" className="button-loader" />
          <p>Carregando carrinho...</p>
        </div>
      ) : cartItems.length === 0 ? (
        <div className={styles.empty}>
          <p>Seu carrinho ainda está vazio.</p>
          <Link className="button button-primary" href="/">
            Ver produtos
          </Link>
        </div>
      ) : (
        <div className={styles.list}>
          {cartItems.map((item) => {
            const product = productsById.get(item.id);
            const stock = getVariationStockStatus(product, item.variation);
            const canChangeVariation = product?.variations?.length > 1;
            const imageUrl = product ? getProductVisualImage(product) : "";

            return (
              <article className={styles.line} key={item.cartKey}>
                <div className={`${styles.image} family-${item.productFamily}`}>
                  {imageUrl ? (
                    <Image
                      alt={item.name}
                      className={styles.photo}
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
                <div className={styles.detail}>
                  <strong>{item.name}</strong>
                  {canChangeVariation ? (
                    <label className={styles.variation}>
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
                <div className={styles.controls}>
                  <div className="quantity-control" aria-label={`Quantidade de ${item.name}`}>
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
                    className={styles.delete}
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
