import "server-only";

import { randomUUID } from "node:crypto";

import { createServiceRoleSupabaseClient } from "@/src/lib/supabase/admin.js";
import {
  buildReviewSummary,
  cleanReviewString,
  detectImageMimeType,
  getReviewImageExtension,
  maxReviewPhotos,
  sanitizePublicReviewerName,
  validateReviewImageMeta,
  validateReviewInput
} from "@/src/reviews/review-utils.js";

const reviewPhotoBucket = "review-photos";

function cleanString(value, maxLength = 500) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function digitsOnly(value) {
  return cleanString(value, 120).replace(/\D/g, "");
}

function contactMatchesOrder(order, contact) {
  const submitted = digitsOnly(contact);

  if (submitted.length < 8) {
    return false;
  }

  const knownValues = [
    order.customer_whatsapp,
    order.customer_phone,
    order.customer_tax_id,
    order.customer_snapshot?.whatsapp,
    order.customer_snapshot?.phone,
    order.customer_snapshot?.taxId
  ]
    .map(digitsOnly)
    .filter((value) => value.length >= 8);

  return knownValues.some(
    (known) =>
      known === submitted ||
      (known.length >= 8 && submitted.endsWith(known)) ||
      (submitted.length >= 8 && known.endsWith(submitted))
  );
}

function getReviewUploadFiles(formData) {
  const files = formData
    .getAll("reviewPhotos")
    .filter((file) => file && typeof file === "object" && Number(file.size) > 0);

  if (files.length > maxReviewPhotos) {
    throw new Error(`Envie no maximo ${maxReviewPhotos} fotos por avaliacao.`);
  }

  return files;
}

async function createSignedPhotoUrls({ photos, supabase }) {
  const signedPhotos = [];

  for (const photo of photos) {
    const { data, error } = await supabase.storage
      .from(photo.storage_bucket ?? reviewPhotoBucket)
      .createSignedUrl(photo.storage_path, 60 * 60 * 24 * 7);

    signedPhotos.push({
      id: photo.id,
      sortOrder: photo.sort_order ?? 0,
      url: error ? "" : data?.signedUrl ?? ""
    });
  }

  return signedPhotos.filter((photo) => photo.url);
}

async function uploadReviewPhotos({ files, reviewId, supabase, userId }) {
  const rows = [];

  for (const [index, file] of files.entries()) {
    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    const detectedMimeType = detectImageMimeType(bytes);
    const errors = validateReviewImageMeta({
      detectedMimeType,
      sizeBytes: Number(file.size)
    });

    if (file.type && file.type !== detectedMimeType) {
      errors.push("O tipo da foto nao confere com o conteudo do arquivo.");
    }

    if (errors.length > 0) {
      throw new Error(errors[0]);
    }

    const extension = getReviewImageExtension(detectedMimeType);
    const storagePath = `${userId}/${reviewId}/${randomUUID()}.${extension}`;
    const { error: uploadError } = await supabase.storage
      .from(reviewPhotoBucket)
      .upload(storagePath, Buffer.from(arrayBuffer), {
        cacheControl: "3600",
        contentType: detectedMimeType,
        upsert: false
      });

    if (uploadError) {
      throw new Error(`Upload de foto falhou: ${uploadError.message}`);
    }

    rows.push({
      mime_type: detectedMimeType,
      review_id: reviewId,
      size_bytes: Number(file.size),
      sort_order: index,
      storage_bucket: reviewPhotoBucket,
      storage_path: storagePath
    });
  }

  if (rows.length === 0) {
    return [];
  }

  const { error } = await supabase.from("order_review_photos").insert(rows);

  if (error) {
    throw new Error(error.message);
  }

  return rows;
}

async function deleteReviewPhotos({ reviewId, supabase }) {
  const { data: existingPhotos, error: lookupError } = await supabase
    .from("order_review_photos")
    .select("id, storage_bucket, storage_path")
    .eq("review_id", reviewId);

  if (lookupError) {
    throw new Error(lookupError.message);
  }

  const pathsByBucket = new Map();

  for (const photo of existingPhotos ?? []) {
    const bucket = photo.storage_bucket ?? reviewPhotoBucket;
    const paths = pathsByBucket.get(bucket) ?? [];
    paths.push(photo.storage_path);
    pathsByBucket.set(bucket, paths);
  }

  for (const [bucket, paths] of pathsByBucket.entries()) {
    if (paths.length > 0) {
      await supabase.storage.from(bucket).remove(paths);
    }
  }

  const { error } = await supabase.from("order_review_photos").delete().eq("review_id", reviewId);

  if (error) {
    throw new Error(error.message);
  }
}

function mapReview(row, photos = []) {
  if (!row) {
    return null;
  }

  return {
    comment: row.comment,
    createdAt: row.created_at,
    id: row.id,
    moderationNote: row.moderation_note,
    orderId: row.order_id,
    orderNumber: row.order_number,
    photos,
    productId: row.product_id,
    productName: row.product_name,
    productSlug: row.product_slug,
    publicName: row.public_name,
    rating: row.rating,
    status: row.status,
    updatedAt: row.updated_at
  };
}

function mapOrderItem(row, review = null) {
  return {
    id: row.id,
    productId: row.product_id,
    productName: row.product_name,
    productSlug: row.product_slug,
    quantity: row.quantity,
    review,
    subtotalCents: row.subtotal_cents,
    variation: row.variation
  };
}

export async function getCustomerAccountOrders({ user }) {
  const supabase = createServiceRoleSupabaseClient();

  if (!supabase) {
    return {
      completedOrders: [],
      inProgressOrders: [],
      isConfigured: false
    };
  }

  if (!user?.id) {
    return {
      completedOrders: [],
      inProgressOrders: [],
      isConfigured: true
    };
  }

  const { data: orders, error: orderError } = await supabase
    .from("orders")
    .select("id, order_number, created_at, operational_status, payment_status, total_cents, currency")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(80);

  if (orderError) {
    throw new Error(orderError.message);
  }

  const orderIds = (orders ?? []).map((order) => order.id);

  if (orderIds.length === 0) {
    return {
      completedOrders: [],
      inProgressOrders: [],
      isConfigured: true
    };
  }

  const [
    { data: items, error: itemError },
    { data: reviews, error: reviewError }
  ] = await Promise.all([
    supabase
      .from("order_items")
      .select("id, order_id, product_id, product_slug, product_name, variation, quantity, subtotal_cents")
      .in("order_id", orderIds)
      .order("created_at", { ascending: true }),
    supabase
      .from("order_item_reviews")
      .select("*")
      .in("order_id", orderIds)
      .eq("user_id", user.id)
  ]);

  const firstError = itemError ?? reviewError;

  if (firstError) {
    throw new Error(firstError.message);
  }

  const reviewIds = (reviews ?? []).map((review) => review.id);
  const photosByReviewId = new Map();

  if (reviewIds.length > 0) {
    const { data: photos, error: photoError } = await supabase
      .from("order_review_photos")
      .select("*")
      .in("review_id", reviewIds)
      .order("sort_order", { ascending: true });

    if (photoError) {
      throw new Error(photoError.message);
    }

    for (const review of reviews ?? []) {
      const reviewPhotos = (photos ?? []).filter((photo) => photo.review_id === review.id);
      photosByReviewId.set(
        review.id,
        await createSignedPhotoUrls({ photos: reviewPhotos, supabase })
      );
    }
  }

  const reviewsByItemId = new Map(
    (reviews ?? []).map((review) => [
      review.order_item_id,
      mapReview(review, photosByReviewId.get(review.id) ?? [])
    ])
  );
  const itemsByOrderId = new Map();

  for (const item of items ?? []) {
    const orderItems = itemsByOrderId.get(item.order_id) ?? [];
    orderItems.push(mapOrderItem(item, reviewsByItemId.get(item.id) ?? null));
    itemsByOrderId.set(item.order_id, orderItems);
  }

  const mappedOrders = (orders ?? []).map((order) => ({
    createdAt: order.created_at,
    currency: order.currency ?? "BRL",
    id: order.id,
    isDelivered: order.operational_status === "entregue",
    items: itemsByOrderId.get(order.id) ?? [],
    operationalStatus: order.operational_status,
    orderNumber: order.order_number,
    paymentStatus: order.payment_status,
    totalCents: order.total_cents
  }));

  return {
    completedOrders: mappedOrders.filter((order) => order.isDelivered),
    inProgressOrders: mappedOrders.filter((order) => !order.isDelivered),
    isConfigured: true
  };
}

export async function claimCustomerOrder({ formData, user }) {
  const supabase = createServiceRoleSupabaseClient();

  if (!supabase) {
    throw new Error("Configure SUPABASE_SERVICE_ROLE_KEY para vincular pedidos.");
  }

  if (!user?.id) {
    throw new Error("Entre na conta para vincular um pedido.");
  }

  const orderNumber = cleanString(formData.get("claimOrderNumber"), 80).toUpperCase();
  const contact = cleanString(formData.get("claimContact"), 120);

  if (!orderNumber || !contact) {
    throw new Error("Informe o numero do pedido e o contato usado na compra.");
  }

  const { data: order, error } = await supabase
    .from("orders")
    .select("id, order_number, user_id, customer_whatsapp, customer_phone, customer_tax_id, customer_snapshot")
    .eq("order_number", orderNumber)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!order || !contactMatchesOrder(order, contact)) {
    throw new Error("Pedido nao encontrado para os dados informados.");
  }

  if (order.user_id && order.user_id !== user.id) {
    throw new Error("Este pedido ja esta vinculado a outra conta.");
  }

  if (!order.user_id) {
    const { error: updateError } = await supabase
      .from("orders")
      .update({ user_id: user.id })
      .eq("id", order.id);

    if (updateError) {
      throw new Error(updateError.message);
    }

    await supabase.from("audit_logs").insert({
      action: "customer_order_claimed",
      actor_user_id: user.id,
      metadata: {
        orderNumber
      },
      order_id: order.id
    });
  }

  return {
    orderNumber: order.order_number
  };
}

export async function submitOrderItemReview({ formData, user }) {
  const supabase = createServiceRoleSupabaseClient();

  if (!supabase) {
    throw new Error("Configure SUPABASE_SERVICE_ROLE_KEY para salvar avaliacoes.");
  }

  if (!user?.id) {
    throw new Error("Entre na conta para avaliar o pedido.");
  }

  const orderId = cleanString(formData.get("orderId"), 80);
  const orderItemId = cleanString(formData.get("orderItemId"), 80);
  const publicName = sanitizePublicReviewerName(formData.get("publicName") || user.email);
  const validation = validateReviewInput({
    comment: formData.get("reviewComment"),
    rating: formData.get("reviewRating")
  });

  if (validation.errors.length > 0) {
    throw new Error(validation.errors[0]);
  }

  const [
    { data: order, error: orderError },
    { data: item, error: itemError }
  ] = await Promise.all([
    supabase
      .from("orders")
      .select("id, order_number, user_id, operational_status")
      .eq("id", orderId)
      .limit(1)
      .maybeSingle(),
    supabase
      .from("order_items")
      .select("id, order_id, product_id, product_slug, product_name")
      .eq("id", orderItemId)
      .limit(1)
      .maybeSingle()
  ]);

  const firstError = orderError ?? itemError;

  if (firstError) {
    throw new Error(firstError.message);
  }

  if (!order || order.user_id !== user.id || order.operational_status !== "entregue") {
    throw new Error("Este item ainda nao pode receber avaliacao.");
  }

  if (!item || item.order_id !== order.id) {
    throw new Error("Item do pedido invalido.");
  }

  const { data: review, error: reviewError } = await supabase
    .from("order_item_reviews")
    .upsert(
      {
        comment: validation.comment,
        moderation_note: null,
        moderated_at: null,
        moderated_by: null,
        order_id: order.id,
        order_item_id: item.id,
        product_id: item.product_id,
        product_name: item.product_name,
        product_slug: item.product_slug,
        public_name: publicName,
        rating: validation.rating,
        status: "pending",
        user_id: user.id
      },
      { onConflict: "order_item_id" }
    )
    .select("id")
    .single();

  if (reviewError) {
    throw new Error(reviewError.message);
  }

  await deleteReviewPhotos({ reviewId: review.id, supabase });
  await uploadReviewPhotos({
    files: getReviewUploadFiles(formData),
    reviewId: review.id,
    supabase,
    userId: user.id
  });

  await supabase.from("audit_logs").insert({
    action: "customer_order_item_review_submitted",
    actor_user_id: user.id,
    metadata: {
      orderNumber: order.order_number,
      productId: item.product_id,
      rating: validation.rating
    },
    order_id: order.id
  });

  return {
    orderNumber: order.order_number
  };
}

export async function moderateOrderReview({ formData }) {
  const supabase = createServiceRoleSupabaseClient();

  if (!supabase) {
    throw new Error("Configure SUPABASE_SERVICE_ROLE_KEY para moderar avaliacoes.");
  }

  const reviewId = cleanString(formData.get("reviewId"), 80);
  const status = cleanString(formData.get("reviewStatus"), 40);

  if (!reviewId || !["approved", "rejected"].includes(status)) {
    throw new Error("Status de avaliacao invalido.");
  }

  const { data, error } = await supabase
    .from("order_item_reviews")
    .update({
      moderation_note: cleanReviewString(formData.get("moderationNote"), 500) || null,
      moderated_at: new Date().toISOString(),
      moderated_by: "admin",
      status
    })
    .eq("id", reviewId)
    .select("id, order_id, product_slug")
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("Avaliacao nao encontrada.");
  }

  await supabase.from("audit_logs").insert({
    action: "admin_order_review_moderated",
    metadata: {
      reviewId,
      status
    },
    order_id: data.order_id
  });

  return {
    productSlug: data.product_slug,
    reviewId,
    status
  };
}

export async function getApprovedProductReviews({ productId, limit = 12 }) {
  const supabase = createServiceRoleSupabaseClient();

  if (!supabase || !productId) {
    return {
      reviews: [],
      summary: buildReviewSummary([])
    };
  }

  const { data: reviews, error } = await supabase
    .from("order_item_reviews")
    .select("id, product_id, product_name, rating, comment, public_name, status, created_at, updated_at")
    .eq("product_id", productId)
    .eq("status", "approved")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(error.message);
  }

  const reviewIds = (reviews ?? []).map((review) => review.id);
  let photos = [];

  if (reviewIds.length > 0) {
    const { data, error: photoError } = await supabase
      .from("order_review_photos")
      .select("*")
      .in("review_id", reviewIds)
      .order("sort_order", { ascending: true });

    if (photoError) {
      throw new Error(photoError.message);
    }

    photos = data ?? [];
  }

  const mappedReviews = [];

  for (const review of reviews ?? []) {
    const reviewPhotos = photos.filter((photo) => photo.review_id === review.id);
    mappedReviews.push(mapReview(review, await createSignedPhotoUrls({ photos: reviewPhotos, supabase })));
  }

  return {
    reviews: mappedReviews,
    summary: buildReviewSummary(mappedReviews)
  };
}

export async function listPendingOrderReviews({ limit = 40, supabase } = {}) {
  const client = supabase ?? createServiceRoleSupabaseClient();

  if (!client) {
    return [];
  }

  const { data: reviews, error } = await client
    .from("order_item_reviews")
    .select("id, order_id, product_id, product_slug, product_name, rating, comment, public_name, status, created_at, updated_at")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) {
    throw new Error(error.message);
  }

  const reviewIds = (reviews ?? []).map((review) => review.id);
  const orderIds = [...new Set((reviews ?? []).map((review) => review.order_id).filter(Boolean))];
  let photos = [];
  let orderNumbersById = new Map();

  if (reviewIds.length > 0) {
    const { data, error: photoError } = await client
      .from("order_review_photos")
      .select("*")
      .in("review_id", reviewIds)
      .order("sort_order", { ascending: true });

    if (photoError) {
      throw new Error(photoError.message);
    }

    photos = data ?? [];
  }

  if (orderIds.length > 0) {
    const { data, error: orderError } = await client
      .from("orders")
      .select("id, order_number")
      .in("id", orderIds);

    if (orderError) {
      throw new Error(orderError.message);
    }

    orderNumbersById = new Map((data ?? []).map((order) => [order.id, order.order_number]));
  }

  const mappedReviews = [];

  for (const review of reviews ?? []) {
    const reviewPhotos = photos.filter((photo) => photo.review_id === review.id);
    mappedReviews.push(
      mapReview(
        {
          ...review,
          order_number: orderNumbersById.get(review.order_id) ?? ""
        },
        await createSignedPhotoUrls({ photos: reviewPhotos, supabase: client })
      )
    );
  }

  return mappedReviews;
}
