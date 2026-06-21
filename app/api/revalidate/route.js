import { timingSafeEqual } from "node:crypto";

import { revalidateCatalogPaths } from "@/src/catalog/revalidation.js";

const catalogTables = new Set(["catalog_products", "catalog_variation_stock"]);

function hasValidSecret(request) {
  const secret = process.env.REVALIDATE_SECRET;
  const authorization = request.headers.get("authorization") ?? "";
  const provided = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";

  if (!secret || !provided) {
    return false;
  }

  const expectedBuffer = Buffer.from(secret);
  const providedBuffer = Buffer.from(provided);

  return (
    expectedBuffer.length === providedBuffer.length &&
    timingSafeEqual(expectedBuffer, providedBuffer)
  );
}

export async function POST(request) {
  if (!hasValidSecret(request)) {
    return Response.json({ error: "Não autorizado." }, { status: 401 });
  }

  let payload;

  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Payload JSON inválido." }, { status: 400 });
  }

  const table = payload.table ?? payload?.record?.table ?? "catalog_products";

  if (!catalogTables.has(table)) {
    return Response.json({ ignored: true, table }, { status: 202 });
  }

  const slug = payload.record?.slug ?? payload.old_record?.slug ?? null;
  revalidateCatalogPaths(slug ? [slug] : []);

  return Response.json({ revalidated: true, slug, table });
}
