import "server-only";

import { createClient } from "@supabase/supabase-js";

import { catalogProducts, toPublicCatalogProduct } from "./index.js";
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
      products: catalogProducts,
      source: "local-fallback"
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
