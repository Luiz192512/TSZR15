import "server-only";

import { createClient } from "@supabase/supabase-js";

import { catalogProducts, toPublicCatalogProduct } from "./index.js";
export {
  buildCatalogCategoryRows,
  buildCatalogProductCategoryRows,
  buildCatalogProductRows
} from "./supabase-rows.js";
import { createServiceRoleSupabaseClient } from "@/src/lib/supabase/admin.js";
import { getPublicSupabaseConfig } from "@/src/lib/supabase/config.js";

function toCatalogProduct(row) {
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

function createCatalogSupabaseClient() {
  const serviceClient = createServiceRoleSupabaseClient();

  if (serviceClient) {
    return serviceClient;
  }

  const config = getPublicSupabaseConfig();

  if (!config.isConfigured) {
    return null;
  }

  return createClient(config.url, config.publishableKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

export async function getSupabaseCatalogProducts({ supabase } = {}) {
  const client = supabase ?? createCatalogSupabaseClient();

  if (!client) {
    return {
      products: catalogProducts,
      source: "local-fallback"
    };
  }

  const { data, error } = await client
    .from("catalog_products")
    .select("*")
    .eq("is_published", true)
    .order("name", { ascending: true });

  if (error || !data?.length) {
    return {
      error,
      products: catalogProducts,
      source: "local-fallback"
    };
  }

  return {
    products: data.map(toCatalogProduct),
    source: "supabase"
  };
}

export async function getPublicCatalogProductsForStorefront(options = {}) {
  const { products, source, error } = await getSupabaseCatalogProducts(options);

  return {
    error,
    products: products.map(toPublicCatalogProduct),
    source
  };
}
