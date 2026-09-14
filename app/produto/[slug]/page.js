import globalStyles from "@/app/storefront.module.css";
import { cx } from "@/src/lib/classnames";
import nextDynamic from "next/dynamic";
import { notFound } from "next/navigation";
import { cache } from "react";

import { getPublicCatalogProductsForStorefront } from "@/src/catalog/supabase-catalog.js";
import { getVariationStockStatus } from "@/src/catalog/stock.js";
import { getApprovedProductReviews } from "@/src/reviews/order-reviews.js";

const ProductDetails = nextDynamic(() =>
  import("@/src/components/catalog/product-details.js").then((module) => module.ProductDetails)
);

const siteUrl = "https://www.tszr15-store.com.br";

// SOFT 404 CONHECIDO: um slug inexistente responde HTTP 200 com o corpo de
// "produto nao encontrado". Medido com build limpa e cache MISS.
//
// A causa NAO e o `force-static` — remove-lo foi testado e o status continuou
// 200. E a mesma limitacao que o middleware ja contorna para a rota de
// pagamento: nesta versao do Next o cabecalho ja saiu quando o componente
// chama `notFound()`.
//
// As duas saidas conhecidas, e por que nenhuma foi tomada aqui:
//   - `dynamicParams = false` devolveria 404 de verdade, mas um produto NOVO
//     passaria a responder 404 ate `generateStaticParams` rodar de novo. Troca
//     um problema de indexacao por um de vitrine, que e pior.
//   - guarda no middleware, como em `/pedido/pagamento`, decide antes do
//     primeiro byte — mas precisa da lista de slugs validos na borda, e hoje
//     ela so existe no banco.
//
// Enquanto isso: a pagina devolve `robots: noindex` quando o produto nao
// existe, o que impede a indexacao mesmo com status 200.
export const dynamic = "force-static";
export const dynamicParams = true;
export const revalidate = 3600;

const getCatalog = cache(() => getPublicCatalogProductsForStorefront());

const getProductBySlug = cache(async (slug) => {
  const catalog = await getCatalog();

  return catalog.products.find((item) => item.slug === slug) ?? null;
});

export async function generateStaticParams() {
  const catalog = await getCatalog();

  return catalog.products.map((product) => ({ slug: product.slug }));
}

async function getSafeReviewState(productId) {
  try {
    return await getApprovedProductReviews({ productId });
  } catch {
    return {
      reviews: [],
      summary: { averageRating: 0, reviewCount: 0 }
    };
  }
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);

  if (!product) {
    // `noindex` porque o status sai 200 (ver o comentario sobre soft 404 no
    // topo do arquivo). Sem isto, o buscador guarda a pagina de erro como se
    // fosse um produto da loja, e quem clicar no resultado cai numa vitrine
    // quebrada. Nao conserta o status, mas corta o dano que ele causa.
    return { robots: { follow: false, index: false }, title: "Produto não encontrado | TSZR15" };
  }

  const canonicalUrl = `${siteUrl}/produto/${product.slug}`;
  const description = `Veja preço, variações e detalhes de ${product.name} para Yamaha R15.`;
  // Foto real do produto no lugar da rota opengraph-image: o next/og embutia
  // ~2 MiB de WASM (resvg/yoga) no worker, acima do limite do plano free.
  const imageUrl = product.imageUrls?.[0] ?? `${siteUrl}/brand/tszr15-product-board.png`;

  return {
    alternates: { canonical: canonicalUrl },
    description,
    openGraph: {
      description,
      images: [{ alt: `${product.name} | TSZR15`, url: imageUrl }],
      title: `${product.name} | TSZR15`,
      type: "website",
      url: canonicalUrl
    },
    title: `${product.name} | TSZR15`,
    twitter: {
      card: "summary_large_image",
      description,
      images: [imageUrl],
      title: `${product.name} | TSZR15`
    }
  };
}

export default async function ProductPage({ params }) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);

  if (!product) {
    notFound();
  }

  const [catalog, reviewState] = await Promise.all([getCatalog(), getSafeReviewState(product.id)]);
  const relatedProducts = catalog.products
    .filter(
      (item) =>
        item.id !== product.id &&
        item.storefrontCategoryIds.some((categoryId) =>
          product.storefrontCategoryIds.includes(categoryId)
        )
    )
    .slice(0, 4);
  const productUrl = `${siteUrl}/produto/${product.slug}`;
  const sizeOptions = Array.isArray(product.sizeOptions) ? product.sizeOptions : [];
  const allVariationsOut = product.variations.every((variation) =>
    sizeOptions.length > 0
      ? sizeOptions.every((size) => !getVariationStockStatus(product, variation, size).canAddToCart)
      : !getVariationStockStatus(product, variation).canAddToCart
  );
  const productSchema = {
    "@context": "https://schema.org",
    "@type": "Product",
    brand: { "@type": "Brand", name: "TSZR15" },
    description: product.notes || `Produto para Yamaha R15: ${product.name}.`,
    image: Array.isArray(product.imageUrls) ? product.imageUrls : [],
    name: product.name,
    offers: {
      "@type": "Offer",
      availability: allVariationsOut
        ? "https://schema.org/OutOfStock"
        : "https://schema.org/InStock",
      price: (product.priceCents / 100).toFixed(2),
      priceCurrency: "BRL",
      url: productUrl
    },
    sku: product.id
  };

  if (reviewState.summary.reviewCount > 0) {
    productSchema.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: reviewState.summary.averageRating.toFixed(1),
      reviewCount: reviewState.summary.reviewCount
    };
  }

  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", item: siteUrl, name: "Início", position: 1 },
      { "@type": "ListItem", item: `${siteUrl}/catalogo`, name: "Catálogo", position: 2 },
      { "@type": "ListItem", item: productUrl, name: product.name, position: 3 }
    ]
  };

  return (
    <main className={cx(globalStyles, "page-shell")}>
      <script
        dangerouslySetInnerHTML={{ __html: JSON.stringify(productSchema).replace(/</g, "\\u003c") }}
        type="application/ld+json"
      />
      <script
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(breadcrumbSchema).replace(/</g, "\\u003c")
        }}
        type="application/ld+json"
      />
      <ProductDetails
        currentUser={null}
        product={product}
        relatedProducts={relatedProducts}
        reviews={reviewState.reviews}
        reviewSummary={reviewState.summary}
      />
    </main>
  );
}
