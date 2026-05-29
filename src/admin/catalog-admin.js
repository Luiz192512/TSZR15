import "server-only";

import {
  storefrontCategories,
  storefrontCategoryMap,
  technicalFamilies
} from "@/src/catalog/categories.js";
import { getAdminSupabaseStatus } from "@/src/admin/order-admin.js";

function cleanString(value, maxLength = 500) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function slugify(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function parseMoneyToCents(value) {
  const cleaned = cleanString(value, 40).replace(/\./g, "").replace(",", ".");

  if (!cleaned) {
    return null;
  }

  const numeric = Number(cleaned);

  if (!Number.isFinite(numeric) || numeric <= 0) {
    return null;
  }

  return Math.round(numeric * 100);
}

function parseInteger(value, fallback = 0) {
  const numeric = Number.parseInt(cleanString(value, 20), 10);

  return Number.isInteger(numeric) && numeric >= 0 ? numeric : fallback;
}

function splitList(value, { maxItems = 30, maxLength = 160 } = {}) {
  return cleanString(value, 5000)
    .split(/\r?\n|,/)
    .map((item) => cleanString(item, maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
}

function splitImageUrls(value) {
  const rawValue = cleanString(value, 9000);
  const separator = rawValue.includes("\n") ? /\r?\n/ : ",";

  return rawValue
    .split(separator)
    .map((item) => cleanString(item, 900))
    .filter(Boolean)
    .slice(0, 12);
}

function isValidImageUrl(value) {
  if (value.startsWith("/")) {
    return true;
  }

  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function getSelectedCategoryIds(formData) {
  return formData
    .getAll("categoryIds")
    .map((categoryId) => cleanString(categoryId, 80))
    .filter((categoryId) => storefrontCategoryMap.has(categoryId));
}

function toAdminProduct(row) {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    storefrontCategoryIds: row.storefront_category_ids ?? [],
    productFamily: row.product_family,
    bikeModelScope: row.bike_model_scope ?? ["yamaha-r15"],
    priceCents: row.price_cents,
    currency: row.currency ?? "BRL",
    variations: row.variations ?? [],
    availability: row.availability ?? "sob-consulta",
    leadTimeDays: row.lead_time_days ?? 2,
    shippingClass: row.shipping_class ?? "medium",
    imageUrls: row.image_urls ?? [],
    notes: row.notes ?? "",
    isPublished: row.is_published !== false,
    updatedAt: row.updated_at,
    createdAt: row.created_at
  };
}

function collectProductPayload(formData) {
  const name = cleanString(formData.get("name"), 180);
  const previousId = cleanString(formData.get("productId"), 160);
  const slug = slugify(formData.get("slug") || name);
  const id = previousId || slug;
  const storefrontCategoryIds = getSelectedCategoryIds(formData);
  const productFamily = cleanString(formData.get("productFamily"), 80);
  const priceCents = parseMoneyToCents(formData.get("price"));
  const variations = splitList(formData.get("variations"), { maxItems: 24, maxLength: 120 });
  const imageUrls = splitImageUrls(formData.get("imageUrls"));
  const bikeModelScope = splitList(formData.get("bikeModelScope"), {
    maxItems: 8,
    maxLength: 80
  });

  if (!name) {
    throw new Error("Informe o nome do produto.");
  }

  if (!id || !slug) {
    throw new Error("Informe um slug/ID valido para o produto.");
  }

  if (storefrontCategoryIds.length === 0) {
    throw new Error("Selecione pelo menos uma categoria.");
  }

  if (!technicalFamilies.includes(productFamily)) {
    throw new Error("Familia tecnica invalida.");
  }

  if (!Number.isInteger(priceCents)) {
    throw new Error("Informe um preco valido.");
  }

  if (variations.length === 0) {
    throw new Error("Informe pelo menos uma variacao.");
  }

  const invalidImageUrl = imageUrls.find((imageUrl) => !isValidImageUrl(imageUrl));

  if (invalidImageUrl) {
    throw new Error(`URL de imagem invalida: ${invalidImageUrl}`);
  }

  return {
    id,
    row: {
      id,
      slug,
      name,
      storefront_category_ids: storefrontCategoryIds,
      product_family: productFamily,
      bike_model_scope: bikeModelScope.length ? bikeModelScope : ["yamaha-r15"],
      price_cents: priceCents,
      currency: "BRL",
      variations,
      availability: cleanString(formData.get("availability"), 80) || "sob-consulta",
      lead_time_days: parseInteger(formData.get("leadTimeDays"), 2),
      shipping_class: cleanString(formData.get("shippingClass"), 80) || "medium",
      image_urls: imageUrls,
      checkout_channel: "whatsapp-business",
      internal_purchase_source: {
        importMode: "admin-curated",
        provider: "painel-admin",
        sourceCategoryIds: storefrontCategoryIds,
        visibility: "internal-only"
      },
      notes: cleanString(formData.get("notes"), 1800),
      is_published: formData.get("isPublished") === "on"
    }
  };
}

export async function getAdminCatalogState() {
  const { isConfigured, supabase } = getAdminSupabaseStatus();

  if (!isConfigured) {
    return {
      categories: storefrontCategories,
      families: technicalFamilies,
      isConfigured,
      products: []
    };
  }

  const { data, error } = await supabase
    .from("catalog_products")
    .select("*")
    .order("is_published", { ascending: false })
    .order("updated_at", { ascending: false })
    .order("name", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return {
    categories: storefrontCategories,
    families: technicalFamilies,
    isConfigured,
    products: (data ?? []).map(toAdminProduct)
  };
}

export async function upsertAdminCatalogProduct(formData) {
  const { isConfigured, supabase } = getAdminSupabaseStatus();

  if (!isConfigured) {
    throw new Error("Configure a URL do Supabase e uma chave privilegiada do Supabase.");
  }

  const { id, row } = collectProductPayload(formData);
  const { error } = await supabase.from("catalog_products").upsert(row, { onConflict: "id" });

  if (error) {
    throw new Error(error.message);
  }

  const { error: deleteError } = await supabase
    .from("catalog_product_categories")
    .delete()
    .eq("product_id", id);

  if (deleteError) {
    throw new Error(deleteError.message);
  }

  const relationRows = row.storefront_category_ids.map((categoryId) => ({
    product_id: id,
    category_id: categoryId
  }));

  const { error: relationError } = await supabase
    .from("catalog_product_categories")
    .insert(relationRows);

  if (relationError) {
    throw new Error(relationError.message);
  }

  return {
    id,
    slug: row.slug
  };
}

export async function archiveAdminCatalogProduct(formData) {
  const { isConfigured, supabase } = getAdminSupabaseStatus();
  const id = cleanString(formData.get("productId"), 160);
  const slug = cleanString(formData.get("slug"), 180);

  if (!isConfigured) {
    throw new Error("Configure a URL do Supabase e uma chave privilegiada do Supabase.");
  }

  if (!id) {
    throw new Error("Produto invalido.");
  }

  const { error } = await supabase
    .from("catalog_products")
    .update({ is_published: false })
    .eq("id", id);

  if (error) {
    throw new Error(error.message);
  }

  return {
    id,
    slug
  };
}
