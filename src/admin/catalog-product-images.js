import { logServerEvent } from "../lib/logger.js";

export const maxAdminProductImages = 12;
const productImageBucket = "product-images";
const allowedImageTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const maxImageBytes = 5 * 1024 * 1024;

function isUploadFile(value) {
  return (
    value &&
    typeof value === "object" &&
    typeof value.arrayBuffer === "function" &&
    typeof value.name === "string" &&
    value.size > 0
  );
}

export function getAdminProductImageFiles(formData) {
  const files = formData.getAll("imageFiles").filter(isUploadFile);

  if (files.length > maxAdminProductImages) {
    throw new Error(`Envie no maximo ${maxAdminProductImages} imagens por produto.`);
  }

  return files;
}

function slugify(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
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

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error ?? "Erro desconhecido.");
}

export async function removeAdminProductImagePaths({ paths, supabase }) {
  const uniquePaths = [...new Set(paths.filter(Boolean))];

  if (uniquePaths.length === 0) {
    return;
  }

  const { error } = await supabase.storage.from(productImageBucket).remove(uniquePaths);

  if (error) {
    throw new Error(`Limpeza de imagens falhou: ${error.message}`);
  }
}

// Uso pos-save: o produto ja foi persistido, entao uma falha ao remover
// imagens substituidas nao pode virar erro para o admin — so log.
export async function removeAdminProductImagePathsSafely({ paths, supabase }) {
  try {
    await removeAdminProductImagePaths({ paths, supabase });
  } catch (error) {
    logServerEvent("warn", "admin_product_image_cleanup_failed", {
      pathCount: paths.length,
      reason: errorMessage(error)
    });
  }
}

async function cleanupAfterError({ error, paths, supabase }) {
  try {
    await removeAdminProductImagePaths({ paths, supabase });
  } catch (cleanupError) {
    throw new Error(`${errorMessage(error)} ${errorMessage(cleanupError)}`, {
      cause: cleanupError
    });
  }

  throw error;
}

export async function uploadAdminProductImages({ formData, productId, supabase }) {
  const files = getAdminProductImageFiles(formData);

  for (const file of files) {
    if (!allowedImageTypes.has(file.type)) {
      throw new Error("Envie imagens JPG, PNG, WEBP ou GIF.");
    }

    if (file.size > maxImageBytes) {
      throw new Error("Cada imagem deve ter no maximo 5MB.");
    }
  }

  const paths = [];
  const urls = [];

  try {
    for (const file of files) {
      const extension = getFileExtension(file);
      const filePath = `${productId}/${Date.now()}-${crypto.randomUUID()}-${safeFileName(file.name)}.${extension}`;
      const fileBuffer = Buffer.from(await file.arrayBuffer());
      const { error } = await supabase.storage
        .from(productImageBucket)
        .upload(filePath, fileBuffer, {
          cacheControl: "31536000",
          contentType: file.type,
          upsert: false
        });

      if (error) {
        throw new Error(`Upload de imagem falhou: ${error.message}`);
      }

      paths.push(filePath);
      const { data } = supabase.storage.from(productImageBucket).getPublicUrl(filePath);

      if (!data?.publicUrl) {
        throw new Error("Upload concluido sem URL publica da imagem.");
      }

      urls.push(data.publicUrl);
    }
  } catch (error) {
    await cleanupAfterError({ error, paths, supabase });
  }

  return { paths, urls };
}

export async function runWithAdminProductImageCleanup({ operation, paths, supabase }) {
  try {
    return await operation();
  } catch (error) {
    await cleanupAfterError({ error, paths, supabase });
  }
}

function getProductImageStoragePath(imageUrl) {
  try {
    const pathname = new URL(imageUrl).pathname;
    const marker = `/storage/v1/object/public/${productImageBucket}/`;
    const markerIndex = pathname.indexOf(marker);

    if (markerIndex < 0) {
      return null;
    }

    const path = decodeURIComponent(pathname.slice(markerIndex + marker.length));
    const segments = path.split("/");

    if (!path || path.includes("\\") || segments.includes("..")) {
      return null;
    }

    return path;
  } catch {
    return null;
  }
}

export function getRemovedAdminProductImagePaths({
  finalImageUrls,
  previousImageUrls,
  productId
}) {
  const productPrefix = `${productId}/`;
  const finalPaths = new Set(finalImageUrls.map(getProductImageStoragePath).filter(Boolean));

  return [
    ...new Set(
      previousImageUrls
        .map(getProductImageStoragePath)
        .filter((path) => path?.startsWith(productPrefix) && !finalPaths.has(path))
    )
  ];
}

function collectProductImageUrls(row) {
  return [
    ...(Array.isArray(row?.image_urls) ? row.image_urls : []),
    ...(Array.isArray(row?.variation_images)
      ? row.variation_images.flatMap((group) =>
          Array.isArray(group?.image_urls) ? group.image_urls : []
        )
      : [])
  ];
}

export async function loadAdminProductImageUrls({ persistenceMode, productId, supabase }) {
  if (persistenceMode !== "update") {
    return [];
  }

  const { data, error } = await supabase
    .from("catalog_products")
    .select("image_urls,variation_images")
    .eq("id", productId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return collectProductImageUrls(data);
}
