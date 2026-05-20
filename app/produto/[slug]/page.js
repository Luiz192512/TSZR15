import { notFound } from "next/navigation";

import { ProductDetails } from "@/src/components/catalog/catalog-experience.js";
import { catalogProducts, getPublicCatalogProducts } from "@/src/catalog/index.js";
import { getCurrentCustomerSnapshot } from "@/src/customer/customer-data.js";
import { createServerSupabaseClient } from "@/src/lib/supabase/server.js";

const publicProducts = getPublicCatalogProducts(catalogProducts);

export function generateStaticParams() {
  return publicProducts.map((product) => ({
    slug: product.slug
  }));
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const product = publicProducts.find((item) => item.slug === slug);

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
  const product = publicProducts.find((item) => item.slug === slug);

  if (!product) {
    notFound();
  }

  const supabase = await createServerSupabaseClient();
  const customerSnapshot = await getCurrentCustomerSnapshot(supabase);
  const relatedProducts = publicProducts
    .filter(
      (item) =>
        item.id !== product.id &&
        item.storefrontCategoryIds.some((categoryId) =>
          product.storefrontCategoryIds.includes(categoryId)
        )
    )
    .slice(0, 4);

  return (
    <main className="page-shell">
      <ProductDetails
        currentUser={customerSnapshot.user}
        product={product}
        relatedProducts={relatedProducts}
      />
    </main>
  );
}
