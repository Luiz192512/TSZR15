import "server-only";

import {
  storefrontCategories,
  storefrontCategoryMap,
  technicalFamilies
} from "@/src/catalog/categories.js";
import { normalizeCouponCode } from "@/src/checkout/coupons.js";
import { getAdminSupabaseStatus } from "@/src/admin/order-admin.js";

const productImageBucket = "product-images";
const allowedImageTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const maxImageBytes = 5 * 1024 * 1024;

function cleanString(value, maxLength = 500) {
  return String(value ?? "")
    .trim()
    .slice(0, maxLength);
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

function parseOptionalMoneyToCents(value) {
  const cleaned = cleanString(value, 40);

  if (!cleaned) {
    return null;
  }

  const numeric = parseMoneyToCents(cleaned);

  if (!Number.isInteger(numeric) || numeric < 0) {
    return null;
  }

  return numeric;
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

function parseVariationStock(value, variations) {
  const quantitiesByVariation = new Map();

  for (const line of cleanString(value, 5000).split(/\r?\n/)) {
    const [rawVariation, rawQuantity = ""] = line.split("=", 2);
    const variation = cleanString(rawVariation, 160);

    if (!variation || !variations.includes(variation)) {
      continue;
    }

    const quantityText = cleanString(rawQuantity, 20);

    if (!quantityText) {
      quantitiesByVariation.set(variation, null);
      continue;
    }

    if (!/^\d+$/.test(quantityText)) {
      throw new Error(`Estoque inválido para a variação ${variation}.`);
    }

    const quantity = Number(quantityText);

    if (!Number.isInteger(quantity) || quantity < 0) {
      throw new Error(`Estoque inválido para a variação ${variation}.`);
    }

    quantitiesByVariation.set(variation, quantity);
  }

  return variations.map((variation) => ({
    quantity: quantitiesByVariation.get(variation) ?? null,
    variation
  }));
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
  const costCents = row.cost_cents ?? row.catalog_product_costs?.cost_cents ?? null;
  const profitCents = Number.isInteger(costCents) ? row.price_cents - costCents : null;

  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    storefrontCategoryIds: row.storefront_category_ids ?? [],
    productFamily: row.product_family,
    bikeModelScope: row.bike_model_scope ?? ["yamaha-r15"],
    priceCents: row.price_cents,
    costCents,
    profitCents,
    marginPercent:
      Number.isInteger(profitCents) && row.price_cents > 0
        ? Math.round((profitCents / row.price_cents) * 100)
        : null,
    currency: row.currency ?? "BRL",
    variations: row.variations ?? [],
    variationStock: row.variation_stock ?? [],
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

function toAdminCoupon(row) {
  return {
    appliesToCategoryIds: row.applies_to_category_ids ?? [],
    appliesToProductIds: row.applies_to_product_ids ?? [],
    code: row.code,
    description: row.description ?? "",
    discountCents: row.discount_cents ?? null,
    discountPercent: row.discount_percent ?? null,
    discountType: row.discount_type,
    expiresAt: row.expires_at ?? "",
    id: row.id,
    isActive: row.is_active !== false,
    maxRedemptions: row.max_redemptions ?? null,
    minimumSubtotalCents: row.minimum_subtotal_cents ?? 0,
    redemptionCount: row.redemption_count ?? 0,
    startsAt: row.starts_at ?? "",
    updatedAt: row.updated_at,
    createdAt: row.created_at
  };
}

function hasUploadFile(value) {
  return (
    value &&
    typeof value === "object" &&
    typeof value.arrayBuffer === "function" &&
    typeof value.name === "string" &&
    value.size > 0
  );
}

function safeFileName(value) {
  const cleaned = slugify(value).slice(0, 80);
  return cleaned || "produto";
}

function getFileExtension(file) {
  const fromName = String(file.name ?? "")
    .split(".")
    .pop()
    ?.toLowerCase();

  if (fromName && /^[a-z0-9]{2,5}$/.test(fromName)) {
    return fromName;
  }

  return file.type === "image/png"
    ? "png"
    : file.type === "image/webp"
      ? "webp"
      : file.type === "image/gif"
        ? "gif"
        : "jpg";
}

async function uploadProductImages({ formData, productId, supabase }) {
  const files = formData.getAll("imageFiles").filter(hasUploadFile).slice(0, 8);

  if (files.length === 0) {
    return [];
  }

  const uploadedUrls = [];

  for (const file of files) {
    if (!allowedImageTypes.has(file.type)) {
      throw new Error("Envie imagens JPG, PNG, WEBP ou GIF.");
    }

    if (file.size > maxImageBytes) {
      throw new Error("Cada imagem deve ter no maximo 5MB.");
    }

    const extension = getFileExtension(file);
    const filePath = `${productId}/${Date.now()}-${crypto.randomUUID()}-${safeFileName(file.name)}.${extension}`;
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const { error } = await supabase.storage.from(productImageBucket).upload(filePath, fileBuffer, {
      cacheControl: "31536000",
      contentType: file.type,
      upsert: false
    });

    if (error) {
      throw new Error(`Upload de imagem falhou: ${error.message}`);
    }

    const { data } = supabase.storage.from(productImageBucket).getPublicUrl(filePath);

    if (data?.publicUrl) {
      uploadedUrls.push(data.publicUrl);
    }
  }

  return uploadedUrls;
}

function collectProductPayload(formData) {
  const name = cleanString(formData.get("name"), 180);
  const previousId = cleanString(formData.get("productId"), 160);
  const slug = slugify(formData.get("slug") || name);
  const id = previousId || slug;
  const storefrontCategoryIds = getSelectedCategoryIds(formData);
  const productFamily = cleanString(formData.get("productFamily"), 80);
  const priceCents = parseMoneyToCents(formData.get("price"));
  const costCents = parseOptionalMoneyToCents(formData.get("cost"));
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
    throw new Error("Informe um preco do cliente valido.");
  }

  if (cleanString(formData.get("cost"), 40) && !Number.isInteger(costCents)) {
    throw new Error("Informe um preco real valido ou deixe vazio.");
  }

  if (variations.length === 0) {
    throw new Error("Informe pelo menos uma variacao.");
  }

  const invalidImageUrl = imageUrls.find((imageUrl) => !isValidImageUrl(imageUrl));

  if (invalidImageUrl) {
    throw new Error(`URL de imagem invalida: ${invalidImageUrl}`);
  }

  return {
    costCents,
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

function collectCouponPayload(formData) {
  const code = normalizeCouponCode(formData.get("couponCode"));
  const discountType = cleanString(formData.get("discountType"), 20) || "percent";
  const discountPercent = parseInteger(formData.get("discountPercent"), 0);
  const discountCents = parseOptionalMoneyToCents(formData.get("discountValue"));
  const minimumSubtotalCents = parseOptionalMoneyToCents(formData.get("minimumSubtotal")) ?? 0;
  const maxRedemptions = parseInteger(formData.get("maxRedemptions"), 0) || null;
  const appliesToProductIds = formData
    .getAll("couponProductIds")
    .map((productId) => cleanString(productId, 160))
    .filter(Boolean)
    .slice(0, 80);
  const appliesToCategoryIds = formData
    .getAll("couponCategoryIds")
    .map((categoryId) => cleanString(categoryId, 80))
    .filter((categoryId) => storefrontCategoryMap.has(categoryId));

  if (!code || code.length < 3) {
    throw new Error("Informe um codigo de cupom com pelo menos 3 caracteres.");
  }

  if (discountType !== "percent" && discountType !== "fixed") {
    throw new Error("Tipo de desconto invalido.");
  }

  if (discountType === "percent" && (discountPercent < 1 || discountPercent > 100)) {
    throw new Error("Informe um percentual entre 1 e 100.");
  }

  if (discountType === "fixed" && !Number.isInteger(discountCents)) {
    throw new Error("Informe o valor do desconto fixo.");
  }

  const startsAt = cleanString(formData.get("startsAt"), 80);
  const expiresAt = cleanString(formData.get("expiresAt"), 80);

  return {
    code,
    row: {
      applies_to_category_ids: appliesToCategoryIds,
      applies_to_product_ids: appliesToProductIds,
      code,
      description: cleanString(formData.get("couponDescription"), 300),
      discount_cents: discountType === "fixed" ? discountCents : null,
      discount_percent: discountType === "percent" ? discountPercent : null,
      discount_type: discountType,
      expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
      is_active: formData.get("couponIsActive") === "on",
      max_redemptions: maxRedemptions,
      minimum_subtotal_cents: minimumSubtotalCents,
      starts_at: startsAt ? new Date(startsAt).toISOString() : null
    }
  };
}

export async function getAdminCatalogState() {
  const { isConfigured, supabase } = getAdminSupabaseStatus();

  if (!isConfigured) {
    return {
      categories: storefrontCategories,
      coupons: [],
      families: technicalFamilies,
      isConfigured,
      products: []
    };
  }

  const [
    { data, error },
    { data: costRows, error: costError },
    { data: couponRows, error: couponError },
    { data: stockRows, error: stockError }
  ] = await Promise.all([
    supabase
      .from("catalog_products")
      .select("*")
      .order("is_published", { ascending: false })
      .order("updated_at", { ascending: false })
      .order("name", { ascending: true }),
    supabase.from("catalog_product_costs").select("*"),
    supabase
      .from("catalog_coupons")
      .select("*")
      .order("is_active", { ascending: false })
      .order("updated_at", { ascending: false })
      .order("code", { ascending: true }),
    supabase.from("catalog_variation_stock").select("product_id, variation, quantity")
  ]);

  const firstError = error ?? costError ?? couponError ?? stockError;

  if (firstError) {
    throw new Error(firstError.message);
  }

  const costsByProductId = new Map((costRows ?? []).map((row) => [row.product_id, row]));
  const stockByProductId = new Map();

  for (const stock of stockRows ?? []) {
    const productStock = stockByProductId.get(stock.product_id) ?? [];
    productStock.push({ quantity: stock.quantity, variation: stock.variation });
    stockByProductId.set(stock.product_id, productStock);
  }
  const productRows = (data ?? []).map((row) => ({
    ...row,
    cost_cents: costsByProductId.get(row.id)?.cost_cents ?? null,
    variation_stock: stockByProductId.get(row.id) ?? []
  }));

  return {
    categories: storefrontCategories,
    coupons: (couponRows ?? []).map(toAdminCoupon),
    families: technicalFamilies,
    isConfigured,
    products: productRows.map(toAdminProduct)
  };
}

export async function upsertAdminCatalogProduct(formData) {
  const { isConfigured, supabase } = getAdminSupabaseStatus();

  if (!isConfigured) {
    throw new Error("Configure a URL do Supabase e uma chave privilegiada do Supabase.");
  }

  const { costCents, id, row } = collectProductPayload(formData);
  const uploadedImageUrls = await uploadProductImages({ formData, productId: id, supabase });
  const finalRow = {
    ...row,
    image_urls: [...uploadedImageUrls, ...row.image_urls].slice(0, 12)
  };
  const { error } = await supabase.from("catalog_products").upsert(finalRow, { onConflict: "id" });

  if (error) {
    throw new Error(error.message);
  }

  const variationStock = parseVariationStock(formData.get("variationStock"), finalRow.variations);
  const { data: currentStockRows, error: currentStockError } = await supabase
    .from("catalog_variation_stock")
    .eq("product_id", id)
    .select("variation");

  if (currentStockError) {
    throw new Error(currentStockError.message);
  }

  const staleVariations = (currentStockRows ?? [])
    .map((stock) => stock.variation)
    .filter((variation) => !finalRow.variations.includes(variation));

  if (staleVariations.length > 0) {
    const staleDeletes = await Promise.all(
      staleVariations.map((variation) =>
        supabase
          .from("catalog_variation_stock")
          .delete()
          .eq("product_id", id)
          .eq("variation", variation)
      )
    );
    const staleDeleteError = staleDeletes.find(({ error: deleteError }) => deleteError)?.error;

    if (staleDeleteError) {
      throw new Error(staleDeleteError.message);
    }
  }

  const { error: stockError } = await supabase.from("catalog_variation_stock").upsert(
    variationStock.map((stock) => ({ ...stock, product_id: id })),
    { onConflict: "product_id,variation" }
  );

  if (stockError) {
    throw new Error(stockError.message);
  }

  if (Number.isInteger(costCents)) {
    const { error: costError } = await supabase.from("catalog_product_costs").upsert(
      {
        cost_cents: costCents,
        currency: "BRL",
        product_id: id
      },
      { onConflict: "product_id" }
    );

    if (costError) {
      throw new Error(costError.message);
    }
  } else {
    const { error: costDeleteError } = await supabase
      .from("catalog_product_costs")
      .delete()
      .eq("product_id", id);

    if (costDeleteError) {
      throw new Error(costDeleteError.message);
    }
  }

  const { error: deleteError } = await supabase
    .from("catalog_product_categories")
    .delete()
    .eq("product_id", id);

  if (deleteError) {
    throw new Error(deleteError.message);
  }

  const relationRows = finalRow.storefront_category_ids.map((categoryId) => ({
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
    slug: finalRow.slug
  };
}

export async function upsertAdminCoupon(formData) {
  const { isConfigured, supabase } = getAdminSupabaseStatus();

  if (!isConfigured) {
    throw new Error("Configure a URL do Supabase e uma chave privilegiada do Supabase.");
  }

  const { code, row } = collectCouponPayload(formData);
  const { error } = await supabase.from("catalog_coupons").upsert(row, { onConflict: "code" });

  if (error) {
    throw new Error(error.message);
  }

  return { code };
}

export async function archiveAdminCoupon(formData) {
  const { isConfigured, supabase } = getAdminSupabaseStatus();
  const code = normalizeCouponCode(formData.get("couponCode"));

  if (!isConfigured) {
    throw new Error("Configure a URL do Supabase e uma chave privilegiada do Supabase.");
  }

  if (!code) {
    throw new Error("Cupom invalido.");
  }

  const { error } = await supabase
    .from("catalog_coupons")
    .update({ is_active: false })
    .eq("code", code);

  if (error) {
    throw new Error(error.message);
  }

  return { code };
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
