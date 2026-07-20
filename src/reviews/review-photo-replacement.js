import { randomUUID } from "node:crypto";

import { logServerEvent } from "../lib/logger.js";
import {
  detectImageMimeType,
  getReviewImageExtension,
  validateReviewImageMeta
} from "./review-utils.js";

const reviewPhotoBucket = "review-photos";

async function prepareReviewPhotos(files) {
  return Promise.all(
    files.map(async (file) => {
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

      return {
        body: Buffer.from(arrayBuffer),
        mimeType: detectedMimeType,
        sizeBytes: Number(file.size)
      };
    })
  );
}

async function removeStorageRows(supabase, rows) {
  const pathsByBucket = new Map();

  for (const row of rows) {
    const bucket = row.storage_bucket ?? reviewPhotoBucket;
    const paths = pathsByBucket.get(bucket) ?? [];
    paths.push(row.storage_path);
    pathsByBucket.set(bucket, paths);
  }

  for (const [bucket, paths] of pathsByBucket.entries()) {
    if (paths.length > 0) {
      const { error } = await supabase.storage.from(bucket).remove(paths);

      if (error) {
        logServerEvent("warn", "review_photo_storage_cleanup_failed", {
          bucket,
          pathCount: paths.length,
          reason: error.message
        });
      }
    }
  }
}

async function rollbackNewPhotos({ rows, supabase }) {
  if (rows.length === 0) {
    return;
  }

  await supabase
    .from("order_review_photos")
    .delete()
    .in(
      "storage_path",
      rows.map((row) => row.storage_path)
    );
  await removeStorageRows(supabase, rows);
}

export async function replaceReviewPhotos({ files, reviewId, supabase, userId }) {
  const preparedPhotos = await prepareReviewPhotos(files);
  const { data: existingPhotos, error: lookupError } = await supabase
    .from("order_review_photos")
    .select("id, storage_bucket, storage_path")
    .eq("review_id", reviewId);

  if (lookupError) {
    throw new Error(lookupError.message);
  }

  const newRows = preparedPhotos.map((photo, index) => ({
    mime_type: photo.mimeType,
    review_id: reviewId,
    size_bytes: photo.sizeBytes,
    sort_order: index,
    storage_bucket: reviewPhotoBucket,
    storage_path: `${userId}/${reviewId}/${randomUUID()}.${getReviewImageExtension(photo.mimeType)}`
  }));
  const uploadedRows = [];

  try {
    for (const [index, row] of newRows.entries()) {
      const { error: uploadError } = await supabase.storage
        .from(reviewPhotoBucket)
        .upload(row.storage_path, preparedPhotos[index].body, {
          cacheControl: "3600",
          contentType: row.mime_type,
          upsert: false
        });

      if (uploadError) {
        throw new Error(`Upload de foto falhou: ${uploadError.message}`);
      }

      uploadedRows.push(row);
    }

    if (newRows.length > 0) {
      const { error: insertError } = await supabase.from("order_review_photos").insert(newRows);

      if (insertError) {
        throw new Error(insertError.message);
      }
    }
  } catch (error) {
    await rollbackNewPhotos({ rows: uploadedRows, supabase });
    throw error;
  }

  const existingIds = (existingPhotos ?? []).map((photo) => photo.id);

  if (existingIds.length > 0) {
    const { error: deleteError } = await supabase
      .from("order_review_photos")
      .delete()
      .in("id", existingIds);

    if (deleteError) {
      await rollbackNewPhotos({ rows: newRows, supabase });
      throw new Error(deleteError.message);
    }
  }

  await removeStorageRows(supabase, existingPhotos ?? []);

  return newRows;
}
