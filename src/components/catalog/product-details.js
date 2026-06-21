"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

import { formatCategoryLabels } from "@/src/catalog/index.js";
import { getProductImageVariants } from "@/src/catalog/image-variants.js";
import { getProductVariationImageIndex } from "@/src/catalog/variation-images.js";
import { getVariationStockStatus } from "@/src/catalog/stock.js";
import { getCartItemKey } from "@/src/cart/cart-items.js";
import { formatCurrency } from "@/src/checkout/whatsapp.js";
import {
  ChevronIcon,
  getProductFamilyLabel,
  getProductImages,
  getProductSummary,
  ProductCard,
  ProductVisual,
  readStoredCart,
  ReviewStars,
  StoreHeader,
  writeStoredCart
} from "./catalog-shared.js";

function ProductImageCarousel({ activeIndex, onActiveIndexChange, product }) {
  const images = getProductImages(product);
  const activeImage = images[activeIndex];
  const activeImageVariants = getProductImageVariants(activeImage);
  const mainImageLoadingProps =
    activeIndex === 0 ? { fetchPriority: "high", priority: true } : { loading: "eager" };

  if (!activeImage) {
    return <ProductVisual product={product} size="detail" />;
  }

  function goToPrevious() {
    onActiveIndexChange((currentIndex) =>
      currentIndex === 0 ? images.length - 1 : currentIndex - 1
    );
  }

  function goToNext() {
    onActiveIndexChange((currentIndex) =>
      currentIndex === images.length - 1 ? 0 : currentIndex + 1
    );
  }

  return (
    <div className="product-photo-carousel">
      <div className="product-photo-main">
        <Image
          alt={product.name}
          fill
          key={activeImageVariants.detail}
          sizes="(max-width: 900px) 94vw, 651px"
          src={activeImageVariants.detail}
          {...mainImageLoadingProps}
        />
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
              onClick={() => onActiveIndexChange(index)}
              type="button"
            >
              <Image
                alt=""
                fill
                loading="lazy"
                sizes="123px"
                src={getProductImageVariants(imageUrl).thumb}
              />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ProductReviewSection({ reviews = [], summary = { averageRating: 0, reviewCount: 0 } }) {
  return (
    <section className="product-reviews-section">
      <div className="section-heading compact-heading">
        <div>
          <p className="section-label">Avaliacoes</p>
          <h2>Experiencia de quem ja recebeu.</h2>
        </div>
        <div className="review-summary-pill">
          <ReviewStars rating={summary.averageRating} />
          <strong>
            {summary.reviewCount > 0 ? `${summary.averageRating.toFixed(1)} / 5` : "Sem notas"}
          </strong>
          <span>{summary.reviewCount} avaliacao(oes)</span>
        </div>
      </div>

      {reviews.length === 0 ? (
        <p className="empty-copy">As primeiras avaliacoes aprovadas deste produto aparecem aqui.</p>
      ) : (
        <div className="product-review-grid">
          {reviews.map((review) => (
            <article className="product-review-card" key={review.id}>
              <div>
                <ReviewStars rating={review.rating} />
                <strong>{review.publicName}</strong>
              </div>
              <p>{review.comment}</p>
              {review.photos?.length ? (
                <div className="product-review-photo-row">
                  {review.photos.map((photo) => (
                    <img alt="" key={photo.id} src={photo.url} />
                  ))}
                </div>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

export function ProductDetails({
  currentUser,
  product,
  relatedProducts = [],
  reviews = [],
  reviewSummary = { averageRating: 0, reviewCount: 0 }
}) {
  const initialVariation =
    product.variations.find(
      (variation) => getVariationStockStatus(product, variation).canAddToCart
    ) ?? product.variations[0];
  const [selectedVariation, setSelectedVariation] = useState(initialVariation);
  const [activeImageIndex, setActiveImageIndex] = useState(() =>
    getProductVariationImageIndex(product, initialVariation)
  );
  const [quantity, setQuantity] = useState(1);
  const [feedback, setFeedback] = useState("");
  const [wasAdded, setWasAdded] = useState(false);
  const categoryLabels = formatCategoryLabels(product.storefrontCategoryIds);
  const stockStatus = getVariationStockStatus(product, selectedVariation);
  const totalCents = product.priceCents * quantity;

  useEffect(() => {
    if (!wasAdded) return undefined;

    const timeout = window.setTimeout(() => setWasAdded(false), 1400);

    return () => window.clearTimeout(timeout);
  }, [wasAdded]);

  function addToCart() {
    if (!stockStatus.canAddToCart) {
      setFeedback("Esta variação está esgotada no momento.");
      return;
    }

    const currentCart = readStoredCart();
    const cartKey = getCartItemKey(product.id, selectedVariation);
    const existingItem = currentCart.find((item) => item.cartKey === cartKey);

    if (
      stockStatus.quantity !== null &&
      (existingItem?.quantity ?? 0) + quantity > stockStatus.quantity
    ) {
      setFeedback(`O limite disponível para esta variação é ${stockStatus.quantity} unidade(s).`);
      return;
    }

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
    setWasAdded(true);
  }

  function selectVariation(variation) {
    if (!getVariationStockStatus(product, variation).canAddToCart) {
      return;
    }

    setSelectedVariation(variation);
    setActiveImageIndex(getProductVariationImageIndex(product, variation));
    setQuantity(1);
  }

  return (
    <>
      <StoreHeader currentUser={currentUser} resolveAccount={false} showSearch={false} />

      <section className="product-detail-layout">
        <div className="product-detail-media">
          <ProductImageCarousel
            activeIndex={activeImageIndex}
            onActiveIndexChange={setActiveImageIndex}
            product={product}
          />
          <div className="detail-assist-box">
            <strong>Compra assistida</strong>
            <span>
              Você compra com a TSZR15. A operação interna valida disponibilidade e entrega antes de
              fechar o atendimento.
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
            <span className="badge badge-family">
              {getProductFamilyLabel(product.productFamily)}
            </span>
          </div>

          <h1>{product.name}</h1>
          <p className="detail-summary">{getProductSummary(product)}</p>
          <div className="detail-review-summary">
            <ReviewStars rating={reviewSummary.averageRating} />
            <span>
              {reviewSummary.reviewCount > 0
                ? `${reviewSummary.averageRating.toFixed(1)} de 5 em ${reviewSummary.reviewCount} avaliacao(oes)`
                : "Ainda sem avaliacoes aprovadas"}
            </span>
          </div>
          <strong className="detail-price">{formatCurrency(product.priceCents)}</strong>

          <div className="option-group">
            <span>Cor / variação</span>
            <div className="variation-grid" role="list">
              {product.variations.map((variation) =>
                (() => {
                  const variationStock = getVariationStockStatus(product, variation);

                  return (
                    <button
                      aria-label={`Selecionar variacao ${variation}`}
                      aria-pressed={selectedVariation === variation}
                      className={`${selectedVariation === variation ? "is-active" : ""} ${
                        variationStock.status === "out" ? "is-unavailable" : ""
                      }`}
                      disabled={!variationStock.canAddToCart}
                      key={variation}
                      onClick={() => selectVariation(variation)}
                      type="button"
                    >
                      {variationStock.status === "out" ? `${variation} — esgotado` : variation}
                    </button>
                  );
                })()
              )}
            </div>
          </div>

          <div className="quantity-row">
            <span>Quantidade</span>
            <div className="quantity-control">
              <button
                aria-label="Diminuir quantidade"
                onClick={() => setQuantity((current) => Math.max(current - 1, 1))}
                type="button"
              >
                -
              </button>
              <span>{quantity}</span>
              <button
                aria-label="Aumentar quantidade"
                disabled={stockStatus.quantity !== null && quantity >= stockStatus.quantity}
                onClick={() =>
                  setQuantity((current) => Math.min(current + 1, stockStatus.quantity ?? 99))
                }
                type="button"
              >
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
              <dd>{stockStatus.label}</dd>
            </div>
            <div>
              <dt>Fechamento</dt>
              <dd>WhatsApp TSZR15</dd>
            </div>
          </dl>

          {feedback ? (
            <p className="form-alert" aria-live="polite" role="status">
              {feedback}
            </p>
          ) : null}

          <div className="detail-actions">
            <button
              className={`button button-primary ${wasAdded ? "is-added" : ""}`}
              disabled={!stockStatus.canAddToCart}
              onClick={addToCart}
              type="button"
            >
              {stockStatus.canAddToCart
                ? wasAdded
                  ? "Adicionado ao carrinho"
                  : stockStatus.status === "consult"
                    ? "Adicionar e consultar"
                    : "Adicionar ao carrinho"
                : "Esgotado"}
            </button>
            <Link className="button button-secondary" href="/pedido">
              Ir para o carrinho
            </Link>
          </div>
        </article>
      </section>

      <ProductReviewSection reviews={reviews} summary={reviewSummary} />

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
