export function toCatalogProduct(row) {
  const variationImages = Array.isArray(row.variation_images)
    ? row.variation_images
        .map((group) => ({
          imageUrls: Array.isArray(group?.image_urls)
            ? group.image_urls.filter((url) => typeof url === "string" && url.trim())
            : [],
          variation: String(group?.variation ?? "").trim()
        }))
        .filter((group) => group.variation)
    : [];

  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    storefrontCategoryIds: row.storefront_category_ids ?? [],
    productFamily: row.product_family,
    bikeModelScope: row.bike_model_scope ?? [],
    priceCents: row.price_cents,
    currency: row.currency,
    variations: row.variations ?? [],
    sizeOptions: row.size_options ?? [],
    availability: row.availability,
    leadTimeDays: row.lead_time_days,
    shippingClass: row.shipping_class,
    imageUrls: row.image_urls ?? [],
    variationImages,
    checkoutChannel: row.checkout_channel,
    internalPurchaseSource: row.internal_purchase_source ?? {},
    notes: row.notes ?? "",
    variationStock: (row.catalog_variation_stock ?? []).map((stock) => ({
      quantity: stock.quantity,
      size: stock.size ?? "",
      variation: stock.variation
    }))
  };
}

const publicCatalogProductColumns = `
  id,
  slug,
  name,
  storefront_category_ids,
  product_family,
  bike_model_scope,
  price_cents,
  currency,
  variations,
  size_options,
  availability,
  lead_time_days,
  shipping_class,
  image_urls,
  variation_images,
  checkout_channel,
  internal_purchase_source,
  notes,
  catalog_variation_stock(
    variation,
    size,
    quantity
  )
`;

export async function readCatalogProductsFromSupabase(client) {
  const { data, error } = await client
    .from("catalog_products")
    .select(publicCatalogProductColumns)
    .eq("is_published", true)
    .order("name", { ascending: true });

  if (error) {
    return {
      error,
      products: [],
      source: "supabase"
    };
  }

  return {
    products: (data ?? []).map(toCatalogProduct),
    source: "supabase"
  };
}
