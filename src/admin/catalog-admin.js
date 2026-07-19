import "server-only";

import {
  storefrontCategories,
  storefrontCategoryMap,
  technicalFamilies
} from "@/src/catalog/categories.js";
import { normalizeCouponCode } from "@/src/checkout/coupons.js";
import { createAdminCatalogLoadError } from "@/src/admin/admin-load-error.js";
import { getAdminSupabaseStatus } from "@/src/admin/order-admin.js";
import { isValidImageUrl, resolveImageOrder } from "@/src/admin/catalog-image-order.js";
import {
  getAdminProductImageFiles,
  getRemovedAdminProductImagePaths,
  loadAdminProductImageUrls,
  removeAdminProductImagePaths,
  runWithAdminProductImageCleanup,
  uploadAdminProductImages
} from "@/src/admin/catalog-product-images.js";
import {
  archiveAdminCouponById,
  saveAdminCoupon
} from "@/src/admin/catalog-coupon-persistence.js";
import { saveAdminCatalogProductRow } from "@/src/admin/catalog-product-persistence.js";
import {
  parseAdminDateTimeInput,
  parseAdminMoneyToCents
} from "@/src/admin/admin-form-values.js";
import { collectAdminVariationInventory } from "@/src/admin/catalog-variations.js";

const adminProductPageSize = 24;
const adminCouponPageSize = 30;
const adminCouponProductOptionLimit = 500;
const adminProductColumns = [
  "id",
  "slug",
  "name",
  "storefront_category_ids",
  "product_family",
  "bike_model_scope",
  "price_cents",
  "currency",
  "variations",
  "availability",
  "lead_time_days",
  "shipping_class",
  "image_urls",
  "notes",
  "is_published",
  "updated_at",
  "created_at",
  "catalog_product_costs(cost_cents)",
  "catalog_variation_stock(variation,quantity)"
].join(",");
const adminCouponColumns = [
  "id",
  "code",
  "description",
  "discount_type",
  "discount_percent",
  "discount_cents",
  "minimum_subtotal_cents",
  "applies_to_product_ids",
  "applies_to_category_ids",
  "starts_at",
  "expires_at",
  "max_redemptions",
  "redemption_count",
  "is_active",
  "updated_at",
  "created_at"
].join(",");

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

function parseInteger(value, fallback = 0) {
  const numeric = Number.parseInt(cleanString(value, 20), 10);

  return Number.isInteger(numeric) && numeric >= 0 ? numeric : fallback;
}

function normalizePage(value) {
  const page = Number.parseInt(String(value ?? ""), 10);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

function getPageMetadata({ count, page, pageSize }) {
  const total = Number.isInteger(count) ? count : 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  return {
    page: Math.min(page, pageCount),
    pageCount,
    pageSize,
    total
  };
}

function mergeRowsByKey(rows, selectedRow, key) {
  if (!selectedRow || rows.some((row) => row[key] === selectedRow[key])) {
    return rows;
  }

  return [selectedRow, ...rows];
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

function splitImageOrderTokens(value) {
  return cleanString(value, 12000)
    .split(/\r?\n/)
    .map((item) => cleanString(item, 900))
    .filter(Boolean)
    .slice(0, 24);
}

function getSelectedCategoryIds(formData) {
  return formData
    .getAll("categoryIds")
    .map((categoryId) => cleanString(categoryId, 80))
    .filter((categoryId) => storefrontCategoryMap.has(categoryId));
}

function toAdminProduct(row) {
  const joinedCost = Array.isArray(row.catalog_product_costs)
    ? row.catalog_product_costs[0]
    : row.catalog_product_costs;
  const costCents = row.cost_cents ?? joinedCost?.cost_cents ?? null;
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
    variationStock: row.variation_stock ?? row.catalog_variation_stock ?? [],
    availability: row.availability ?? "sob-consulta",
    leadTimeDays: row.lead_time_days ?? 2,
    shippingClass: row.shipping_class ?? "medium",
    imageUrls: row.image_urls ?? [],
    variationImages: Array.isArray(row.variation_images)
      ? row.variation_images.map((group) => ({
          imageUrls: Array.isArray(group?.image_urls) ? group.image_urls : [],
          variation: group?.variation ?? ""
        }))
      : [],
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

function collectProductPayload(formData) {
  const name = cleanString(formData.get("name"), 180);
  const previousId = cleanString(formData.get("productId"), 160);
  const persistenceMode = previousId ? "update" : "create";
  const slug = slugify(formData.get("slug") || name);
  const id = previousId || slug;
  const storefrontCategoryIds = getSelectedCategoryIds(formData);
  const productFamily = cleanString(formData.get("productFamily"), 80);
  const priceCents = parseAdminMoneyToCents(formData.get("price"));
  const costCents = parseAdminMoneyToCents(formData.get("cost"), { allowZero: true });
  const {
    stock: variationStock,
    variationImageTokens,
    variations
  } = collectAdminVariationInventory(formData);
  const usesVariationCards = formData.get("variationCards") !== null;
  const imageUrls = splitImageUrls(formData.get("imageUrls"));
  const imageOrderTokens = splitImageOrderTokens(formData.get("imageOrder"));
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
  const invalidVariationImageToken = variationImageTokens
    .flatMap((group) => group.imageTokens)
    .find((token) => !/^new:\d+$/.test(token) && !isValidImageUrl(token));

  if (invalidImageUrl || invalidVariationImageToken) {
    throw new Error(`URL de imagem invalida: ${invalidImageUrl ?? invalidVariationImageToken}`);
  }

  return {
    costCents,
    id,
    imageOrderTokens,
    persistenceMode,
    usesVariationCards,
    variationImageTokens,
    variationStock,
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
  const couponId = cleanString(formData.get("couponId"), 80);
  const code = normalizeCouponCode(formData.get("couponCode"));
  const discountType = cleanString(formData.get("discountType"), 20) || "percent";
  const discountPercent = parseInteger(formData.get("discountPercent"), 0);
  const discountCents = parseAdminMoneyToCents(formData.get("discountValue"));
  const minimumSubtotal = cleanString(formData.get("minimumSubtotal"), 40);
  const parsedMinimumSubtotalCents = parseAdminMoneyToCents(minimumSubtotal, {
    allowZero: true
  });
  const minimumSubtotalCents = parsedMinimumSubtotalCents ?? 0;
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

  if (minimumSubtotal && !Number.isInteger(parsedMinimumSubtotalCents)) {
    throw new Error("Informe um subtotal minimo valido.");
  }

  const startsAt = cleanString(formData.get("startsAt"), 80);
  const expiresAt = cleanString(formData.get("expiresAt"), 80);
  const startsAtIso = startsAt ? parseAdminDateTimeInput(startsAt) : null;
  const expiresAtIso = expiresAt ? parseAdminDateTimeInput(expiresAt) : null;

  if (startsAt && !startsAtIso) {
    throw new Error("Informe uma data inicial valida no horario de Brasilia.");
  }

  if (expiresAt && !expiresAtIso) {
    throw new Error("Informe uma data final valida no horario de Brasilia.");
  }

  if (startsAtIso && expiresAtIso && new Date(expiresAtIso) <= new Date(startsAtIso)) {
    throw new Error("A expiracao do cupom deve ser posterior ao inicio.");
  }

  return {
    code,
    couponId,
    row: {
      applies_to_category_ids: appliesToCategoryIds,
      applies_to_product_ids: appliesToProductIds,
      code,
      description: cleanString(formData.get("couponDescription"), 300),
      discount_cents: discountType === "fixed" ? discountCents : null,
      discount_percent: discountType === "percent" ? discountPercent : null,
      discount_type: discountType,
      expires_at: expiresAtIso,
      is_active: formData.get("couponIsActive") === "on",
      max_redemptions: maxRedemptions,
      minimum_subtotal_cents: minimumSubtotalCents,
      starts_at: startsAtIso
    }
  };
}

export async function getAdminCatalogState(options = {}) {
  const {
    couponPage: requestedCouponPage = 1,
    productPage: requestedProductPage = 1,
    selectedCouponCode = "",
    selectedProductId = ""
  } = options;
  const { isConfigured, supabase } = getAdminSupabaseStatus();
  const couponPage = normalizePage(requestedCouponPage);
  const productPage = normalizePage(requestedProductPage);

  if (!isConfigured) {
    return {
      categories: storefrontCategories,
      couponProductOptions: [],
      coupons: [],
      families: technicalFamilies,
      isConfigured,
      pagination: {
        coupons: getPageMetadata({ count: 0, page: 1, pageSize: adminCouponPageSize }),
        products: getPageMetadata({ count: 0, page: 1, pageSize: adminProductPageSize })
      },
      products: []
    };
  }

  const productFrom = (productPage - 1) * adminProductPageSize;
  const couponFrom = (couponPage - 1) * adminCouponPageSize;
  const [
    { count: productCount, data: productRows, error: productError },
    { count: couponCount, data: couponRows, error: couponError },
    { count: couponProductOptionCount, data: couponProductOptionRows, error: optionError },
    { data: selectedProductRow, error: selectedProductError },
    { data: selectedCouponRow, error: selectedCouponError }
  ] = await Promise.all([
    supabase
      .from("catalog_products")
      .select(adminProductColumns, { count: "exact" })
      .order("is_published", { ascending: false })
      .order("updated_at", { ascending: false })
      .order("name", { ascending: true })
      .range(productFrom, productFrom + adminProductPageSize - 1),
    supabase
      .from("catalog_coupons")
      .select(adminCouponColumns, { count: "exact" })
      .order("is_active", { ascending: false })
      .order("updated_at", { ascending: false })
      .order("code", { ascending: true })
      .range(couponFrom, couponFrom + adminCouponPageSize - 1),
    supabase
      .from("catalog_products")
      .select("id,name", { count: "exact" })
      .order("name", { ascending: true })
      .range(0, adminCouponProductOptionLimit - 1),
    selectedProductId
      ? supabase
          .from("catalog_products")
          .select(adminProductColumns)
          .eq("id", selectedProductId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    selectedCouponCode
      ? supabase
          .from("catalog_coupons")
          .select(adminCouponColumns)
          .eq("code", normalizeCouponCode(selectedCouponCode))
          .maybeSingle()
      : Promise.resolve({ data: null, error: null })
  ]);

  const firstError =
    productError ??
    couponError ??
    optionError ??
    selectedProductError ??
    selectedCouponError;

  if (firstError) {
    throw createAdminCatalogLoadError(firstError);
  }

  const productPagination = getPageMetadata({
    count: productCount,
    page: productPage,
    pageSize: adminProductPageSize
  });
  const couponPagination = getPageMetadata({
    count: couponCount,
    page: couponPage,
    pageSize: adminCouponPageSize
  });
  let pagedProductRows = productRows ?? [];
  let pagedCouponRows = couponRows ?? [];

  if (productPagination.total > 0 && productPagination.page !== productPage) {
    const correctedFrom = (productPagination.page - 1) * adminProductPageSize;
    const { data: correctedRows, error: correctedError } = await supabase
      .from("catalog_products")
      .select(adminProductColumns)
      .order("is_published", { ascending: false })
      .order("updated_at", { ascending: false })
      .order("name", { ascending: true })
      .range(correctedFrom, correctedFrom + adminProductPageSize - 1);

    if (correctedError) {
      throw createAdminCatalogLoadError(correctedError);
    }

    pagedProductRows = correctedRows ?? [];
  }

  if (couponPagination.total > 0 && couponPagination.page !== couponPage) {
    const correctedFrom = (couponPagination.page - 1) * adminCouponPageSize;
    const { data: correctedRows, error: correctedError } = await supabase
      .from("catalog_coupons")
      .select(adminCouponColumns)
      .order("is_active", { ascending: false })
      .order("updated_at", { ascending: false })
      .order("code", { ascending: true })
      .range(correctedFrom, correctedFrom + adminCouponPageSize - 1);

    if (correctedError) {
      throw createAdminCatalogLoadError(correctedError);
    }

    pagedCouponRows = correctedRows ?? [];
  }

  const visibleProductRows = mergeRowsByKey(pagedProductRows, selectedProductRow, "id");
  const visibleCouponRows = mergeRowsByKey(pagedCouponRows, selectedCouponRow, "id");
  const couponProductOptions = [...(couponProductOptionRows ?? [])];
  const optionIds = new Set(couponProductOptions.map((product) => product.id));

  for (const productId of selectedCouponRow?.applies_to_product_ids ?? []) {
    if (!optionIds.has(productId)) {
      couponProductOptions.push({ id: productId, name: productId });
      optionIds.add(productId);
    }
  }

  return {
    categories: storefrontCategories,
    couponProductOptions,
    couponProductOptionsTruncated:
      Number.isInteger(couponProductOptionCount) &&
      couponProductOptionCount > adminCouponProductOptionLimit,
    coupons: visibleCouponRows.map(toAdminCoupon),
    families: technicalFamilies,
    isConfigured,
    pagination: {
      coupons: couponPagination,
      products: productPagination
    },
    products: visibleProductRows.map(toAdminProduct)
  };
}

export async function upsertAdminCatalogProduct(formData) {
  const { isConfigured, supabase } = getAdminSupabaseStatus();

  if (!isConfigured) {
    throw new Error("Configure a URL do Supabase e uma chave privilegiada do Supabase.");
  }

  const {
    costCents,
    id,
    imageOrderTokens,
    persistenceMode,
    row,
    usesVariationCards,
    variationImageTokens,
    variationStock
  } = collectProductPayload(formData);
  getAdminProductImageFiles(formData);
  const previousImageUrls = await loadAdminProductImageUrls({
    persistenceMode,
    productId: id,
    supabase
  });
  const { paths: uploadedImagePaths, urls: uploadedImageUrls } =
    await uploadAdminProductImages({ formData, productId: id, supabase });
  const finalVariationImages = usesVariationCards
    ? variationImageTokens.map((group) => ({
        image_urls: resolveImageOrder(group.imageTokens, uploadedImageUrls),
        variation: group.variation
      }))
    : [];
  const finalImageUrls = usesVariationCards
    ? finalVariationImages.flatMap((group) => group.image_urls).slice(0, 12)
    : imageOrderTokens.length > 0
      ? resolveImageOrder(imageOrderTokens, uploadedImageUrls)
      : [...uploadedImageUrls, ...row.image_urls].slice(0, 12);
  const finalRow = {
    ...row,
    image_urls: finalImageUrls,
    variation_images: finalVariationImages
  };
  await runWithAdminProductImageCleanup({
    operation: () => saveAdminCatalogProductRow({ persistenceMode, row: finalRow, supabase }),
    paths: uploadedImagePaths,
    supabase
  });

  const { data: currentStockRows, error: currentStockError } = await supabase
    .from("catalog_variation_stock")
    .select("variation")
    .eq("product_id", id);

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

  const removedImagePaths = getRemovedAdminProductImagePaths({
    finalImageUrls: [
      ...finalRow.image_urls,
      ...finalRow.variation_images.flatMap((group) => group.image_urls)
    ],
    previousImageUrls,
    productId: id
  });
  await removeAdminProductImagePaths({ paths: removedImagePaths, supabase });

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

  const { couponId, row } = collectCouponPayload(formData);
  return saveAdminCoupon({ couponId, row, supabase });
}

export async function archiveAdminCoupon(formData) {
  const { isConfigured, supabase } = getAdminSupabaseStatus();
  const couponId = cleanString(formData.get("couponId"), 80);

  if (!isConfigured) {
    throw new Error("Configure a URL do Supabase e uma chave privilegiada do Supabase.");
  }

  if (!couponId) {
    throw new Error("Cupom invalido.");
  }

  return archiveAdminCouponById({ couponId, supabase });
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
