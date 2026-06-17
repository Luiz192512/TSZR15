import { readFileSync } from "node:fs";
import { basename, extname, resolve } from "node:path";
import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

import {
  getProductImageVariants,
  isOptimizedProductImageUrl
} from "../src/catalog/image-variants.js";
import { getSupabaseServiceRoleKey, getSupabaseUrl } from "../src/lib/supabase/config.js";

const envPath = resolve(process.cwd(), ".env.local");
const productImageBucket = "product-images";
const cacheControl = "31536000";
const webpQuality = 84;
const variants = [
  { maxWidth: 200, name: "thumb" },
  { maxWidth: 640, name: "card" },
  { maxWidth: 1200, name: "detail" }
];

function loadLocalEnv() {
  let content;

  try {
    content = readFileSync(envPath, "utf8");
  } catch {
    return;
  }

  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\s*([^#=\s]+)\s*=\s*(.*)\s*$/);

    if (!match) {
      continue;
    }

    const [, key, rawValue] = match;
    const value = rawValue.replace(/^['"]|['"]$/g, "");

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function getJwtRole(token) {
  const parts = String(token ?? "").split(".");

  if (parts.length < 2) {
    return "";
  }

  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    return payload.role ?? "";
  } catch {
    return "";
  }
}

function parseArgs() {
  const args = new Set(process.argv.slice(2));
  const explicitTargetIndex = process.argv.findIndex((argument) => argument === "--target");

  return {
    apply: args.has("--apply"),
    dryRun: args.has("--dry-run") || !args.has("--apply"),
    target: explicitTargetIndex >= 0 ? process.argv[explicitTargetIndex + 1] : ""
  };
}

function sanitizePathSegment(value, fallback = "image") {
  const sanitized = String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 90);

  return sanitized || fallback;
}

function getSourceBaseName(imageUrl, index) {
  try {
    const parsed = new URL(imageUrl);
    const decodedName = decodeURIComponent(basename(parsed.pathname));
    const extension = extname(decodedName);
    const nameWithoutExtension = extension ? decodedName.slice(0, -extension.length) : decodedName;

    return `${String(index + 1).padStart(2, "0")}-${sanitizePathSegment(nameWithoutExtension)}`;
  } catch {
    return `${String(index + 1).padStart(2, "0")}-image`;
  }
}

function validateImageUrl(imageUrl) {
  try {
    const parsed = new URL(imageUrl);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

async function downloadImage(imageUrl) {
  const response = await fetch(imageUrl);

  if (!response.ok) {
    throw new Error(`Download falhou (${response.status}) para ${imageUrl}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

async function createVariantBuffer(sourceBuffer, maxWidth) {
  return sharp(sourceBuffer)
    .rotate()
    .resize({
      fit: "inside",
      height: maxWidth,
      width: maxWidth,
      withoutEnlargement: true
    })
    .webp({ effort: 5, quality: webpQuality })
    .toBuffer();
}

async function uploadVariant({ buffer, filePath, supabase }) {
  const { error } = await supabase.storage.from(productImageBucket).upload(filePath, buffer, {
    cacheControl,
    contentType: "image/webp",
    upsert: false
  });

  if (error) {
    throw new Error(`Upload falhou para ${filePath}: ${error.message}`);
  }

  const { data } = supabase.storage.from(productImageBucket).getPublicUrl(filePath);

  if (!data?.publicUrl) {
    throw new Error(`Nao foi possivel gerar URL publica para ${filePath}`);
  }

  return data.publicUrl;
}

async function verifyPublicImage(url) {
  const response = await fetch(url, { headers: { Range: "bytes=0-0" } });

  return {
    cacheControl: response.headers.get("cache-control") ?? "",
    contentType: response.headers.get("content-type") ?? "",
    ok: response.ok,
    status: response.status,
    url
  };
}

async function optimizeImage({ imageUrl, imageIndex, product, runId, supabase }) {
  const sourceBuffer = await downloadImage(imageUrl);
  const sourceBaseName = getSourceBaseName(imageUrl, imageIndex);
  const uploadBasePath = `${product.slug}/optimized-${runId}/${sourceBaseName}-${randomUUID()}`;
  const uploadedUrls = {};
  const uploadedBytes = {};

  for (const variant of variants) {
    const buffer = await createVariantBuffer(sourceBuffer, variant.maxWidth);
    const filePath = `${uploadBasePath}-${variant.name}.webp`;
    uploadedUrls[variant.name] = await uploadVariant({ buffer, filePath, supabase });
    uploadedBytes[variant.name] = buffer.byteLength;
  }

  return {
    bytes: uploadedBytes,
    detailUrl: uploadedUrls.detail
  };
}

function formatBytes(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

async function readPublishedProducts(supabase) {
  const { data, error } = await supabase
    .from("catalog_products")
    .select("id, slug, name, image_urls")
    .eq("is_published", true)
    .order("name", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

async function updateProductImages({ imageUrls, product, supabase }) {
  const { error } = await supabase
    .from("catalog_products")
    .update({ image_urls: imageUrls })
    .eq("id", product.id);

  if (error) {
    throw new Error(`${product.name}: ${error.message}`);
  }
}

async function main() {
  const options = parseArgs();

  loadLocalEnv();

  if (options.target) {
    process.env.SUPABASE_RUNTIME_TARGET = options.target;
  }

  const url = getSupabaseUrl();
  const serviceRoleKey = getSupabaseServiceRoleKey();

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Configure NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.local."
    );
  }

  if (getJwtRole(serviceRoleKey) === "anon") {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY esta com uma chave anon. Use a service_role real.");
  }

  const supabase = createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
  const products = await readPublishedProducts(supabase);
  const imageEntries = products.flatMap((product) =>
    (Array.isArray(product.image_urls) ? product.image_urls : []).map((imageUrl, imageIndex) => ({
      imageIndex,
      imageUrl,
      product
    }))
  );
  const invalidEntries = imageEntries.filter((entry) => !validateImageUrl(entry.imageUrl));
  const optimizedEntries = imageEntries.filter((entry) =>
    isOptimizedProductImageUrl(entry.imageUrl)
  );
  const pendingEntries = imageEntries.filter(
    (entry) => validateImageUrl(entry.imageUrl) && !isOptimizedProductImageUrl(entry.imageUrl)
  );

  console.log(
    JSON.stringify(
      {
        dryRun: options.dryRun,
        invalidImages: invalidEntries.length,
        optimizedImages: optimizedEntries.length,
        pendingImages: pendingEntries.length,
        publishedProducts: products.length,
        totalImages: imageEntries.length
      },
      null,
      2
    )
  );

  if (invalidEntries.length > 0) {
    for (const entry of invalidEntries) {
      console.error(`${entry.product.name}: URL invalida: ${entry.imageUrl}`);
    }

    throw new Error("Corrija URLs invalidas antes de otimizar.");
  }

  if (options.dryRun) {
    return;
  }

  const runId = new Date()
    .toISOString()
    .replace(/[-:.TZ]/g, "")
    .slice(0, 14);
  let optimizedBytes = 0;
  let verifiedVariantCount = 0;
  const failedVerifications = [];
  const sampleVerifications = [];

  for (const product of products) {
    const currentImageUrls = Array.isArray(product.image_urls) ? product.image_urls : [];
    const failedVerificationsBeforeProduct = failedVerifications.length;
    const nextImageUrls = [];

    for (const [imageIndex, imageUrl] of currentImageUrls.entries()) {
      if (isOptimizedProductImageUrl(imageUrl)) {
        nextImageUrls.push(getProductImageVariants(imageUrl).detail);
        continue;
      }

      const result = await optimizeImage({ imageIndex, imageUrl, product, runId, supabase });
      optimizedBytes += Object.values(result.bytes).reduce((total, bytes) => total + bytes, 0);
      nextImageUrls.push(result.detailUrl);

      const variantUrls = getProductImageVariants(result.detailUrl);
      const verifications = await Promise.all(
        [variantUrls.thumb, variantUrls.card, variantUrls.detail].map((variantUrl) =>
          verifyPublicImage(variantUrl)
        )
      );
      verifiedVariantCount += verifications.length;
      failedVerifications.push(...verifications.filter((verification) => !verification.ok));

      if (sampleVerifications.length < 6) {
        sampleVerifications.push(...verifications.slice(0, 6 - sampleVerifications.length));
      }
    }

    if (failedVerifications.length > failedVerificationsBeforeProduct) {
      console.error(JSON.stringify({ failedVerifications }, null, 2));
      throw new Error(`${product.name}: uma ou mais variantes otimizadas nao ficaram acessiveis.`);
    }

    await updateProductImages({ imageUrls: nextImageUrls, product, supabase });
    console.log(`${product.name}: ${nextImageUrls.length} imagem(ns) atualizada(s).`);
  }

  if (failedVerifications.length > 0) {
    console.error(JSON.stringify({ failedVerifications }, null, 2));
    throw new Error("Uma ou mais variantes otimizadas nao ficaram acessiveis.");
  }

  console.log(
    JSON.stringify(
      {
        optimizedVariantBytes: formatBytes(optimizedBytes),
        sampleVerifications,
        verifiedVariantCount
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
