import "server-only";

import { unstable_cache } from "next/cache";
import { createClient } from "@supabase/supabase-js";

import { STOREFRONT_CATALOG_CACHE_TAG } from "./cache-constants.js";
import { toPublicCatalogProduct } from "./index.js";
import { readCatalogProductsFromSupabase } from "./supabase-catalog-core.js";
export {
  buildCatalogCategoryRows,
  buildCatalogProductCategoryRows,
  buildCatalogProductRows
} from "./supabase-rows.js";
import { createServiceRoleSupabaseClient } from "@/src/lib/supabase/admin.js";
import { getPublicSupabaseConfig } from "@/src/lib/supabase/config.js";

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
      products: [],
      source: "supabase-unconfigured"
    };
  }

  return readCatalogProductsFromSupabase(client);
}

export async function getPublicCatalogProductsForStorefront(options = {}) {
  const { products, source, error } = await getSupabaseCatalogProducts(options);

  return {
    error,
    products: products.map(toPublicCatalogProduct),
    source
  };
}

const readCachedPublicStorefrontCatalog = unstable_cache(
  async () => {
    const catalog = await getPublicCatalogProductsForStorefront();

    if (catalog.error) {
      throw new Error(catalog.error.message ?? "Nao foi possivel carregar o catalogo.");
    }

    return catalog;
  },
  [STOREFRONT_CATALOG_CACHE_TAG],
  {
    revalidate: 3600,
    tags: [STOREFRONT_CATALOG_CACHE_TAG]
  }
);

export function getCachedPublicCatalogProductsForStorefront() {
  return readCachedPublicStorefrontCatalog();
}
