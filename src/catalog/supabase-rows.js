import { catalogProducts, storefrontCategories } from "./index.js";

export function buildCatalogCategoryRows(categories = storefrontCategories) {
  return categories.map((category, index) => ({
    id: category.id,
    label: category.label,
    slug: category.slug,
    sort_order: index,
    is_visible: true
  }));
}

export function buildCatalogProductRows(products = catalogProducts) {
  return products.map((product) => ({
    id: product.id,
    slug: product.slug,
    name: product.name,
    storefront_category_ids: product.storefrontCategoryIds,
    product_family: product.productFamily,
    bike_model_scope: product.bikeModelScope,
    price_cents: product.priceCents,
    currency: product.currency,
    variations: product.variations,
    availability: product.availability,
    lead_time_days: product.leadTimeDays,
    shipping_class: product.shippingClass,
    image_urls: product.imageUrls ?? [],
    checkout_channel: product.checkoutChannel,
    internal_purchase_source: product.internalPurchaseSource,
    notes: product.notes ?? "",
    is_published: true
  }));
}

export function buildCatalogProductCategoryRows(products = catalogProducts) {
  return products.flatMap((product) =>
    product.storefrontCategoryIds.map((categoryId) => ({
      product_id: product.id,
      category_id: categoryId
    }))
  );
}
