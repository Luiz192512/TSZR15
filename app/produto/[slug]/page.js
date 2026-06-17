import nextDynamic from "next/dynamic";
import { notFound } from "next/navigation";

import { getPublicCatalogProductsForStorefront } from "@/src/catalog/supabase-catalog.js";
import { getApprovedProductReviews } from "@/src/reviews/order-reviews.js";

const ProductDetails = nextDynamic(() =>
  import("@/src/components/catalog/product-details.js").then((module) => module.ProductDetails)
);

export const dynamic = "force-static";
export const dynamicParams = true;
export const revalidate = 3600;

export async function generateStaticParams() {
  const catalog = await getPublicCatalogProductsForStorefront();

  return catalog.products.map((product) => ({
    slug: product.slug
  }));
}

async function getSafeReviewState(productId) {
  try {
    return await getApprovedProductReviews({ productId });
  } catch {
    return {
      reviews: [],
      summary: {
        averageRating: 0,
        reviewCount: 0
      }
    };
  }
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const catalog = await getPublicCatalogProductsForStorefront();
  const product = catalog.products.find((item) => item.slug === slug);

  if (!product) {
    return {
      title: "Produto nao encontrado | TSZR15"
    };
  }

  return {
    title: `${product.name} | TSZR15`,
    description: `Veja preco, variacoes e detalhes de ${product.name} para Yamaha R15.`
  };
}

export default async function ProductPage({ params }) {
  const { slug } = await params;
  const catalog = await getPublicCatalogProductsForStorefront();
  const product = catalog.products.find((item) => item.slug === slug);

  if (!product) {
    notFound();
  }

  const relatedProducts = catalog.products
    .filter(
      (item) =>
        item.id !== product.id &&
        item.storefrontCategoryIds.some((categoryId) =>
          product.storefrontCategoryIds.includes(categoryId)
        )
    )
    .slice(0, 4);
  const reviewState = await getSafeReviewState(product.id);

  return (
    <main className="page-shell">
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
