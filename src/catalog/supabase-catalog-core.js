export function toCatalogProduct(row) {
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
    availability: row.availability,
    leadTimeDays: row.lead_time_days,
    shippingClass: row.shipping_class,
    imageUrls: row.image_urls ?? [],
    checkoutChannel: row.checkout_channel,
    internalPurchaseSource: row.internal_purchase_source ?? {},
    notes: row.notes ?? ""
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
  availability,
  lead_time_days,
  shipping_class,
  image_urls,
  checkout_channel,
  internal_purchase_source,
  notes
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
