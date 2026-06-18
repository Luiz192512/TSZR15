"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

import { formatCategoryLabels } from "@/src/catalog/index.js";
import { getProductImageVariants } from "@/src/catalog/image-variants.js";
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
function ProductImageCarousel({ product }) {
  const images = getProductImages(product);
  const [activeIndex, setActiveIndex] = useState(0);
  const activeImage = images[activeIndex];
  const activeImageVariants = getProductImageVariants(activeImage);
  const mainImageLoadingProps = activeIndex === 0 ? { priority: true } : { loading: "eager" };

  if (!activeImage) {
    return <ProductVisual product={product} size="detail" />;
  }

  function goToPrevious() {
    setActiveIndex((currentIndex) => (currentIndex === 0 ? images.length - 1 : currentIndex - 1));
  }

  function goToNext() {
    setActiveIndex((currentIndex) => (currentIndex === images.length - 1 ? 0 : currentIndex + 1));
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
              onClick={() => setActiveIndex(index)}
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
              {product.variations.map((variation) => (
                <button
                  aria-label={`Selecionar variacao ${variation}`}
                  aria-pressed={selectedVariation === variation}
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
                onClick={() => setQuantity((current) => Math.min(current + 1, 99))}
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
              <dd>
                {product.availability === "sob-consulta" ? "Sob consulta" : product.availability}
              </dd>
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
            <button className="button button-primary" onClick={addToCart} type="button">
              Adicionar ao carrinho
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
