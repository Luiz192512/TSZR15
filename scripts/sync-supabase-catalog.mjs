import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient } from "@supabase/supabase-js";

import { catalogProducts, validateCatalog } from "../src/catalog/index.js";
import {
  buildCatalogCategoryRows,
  buildCatalogProductCategoryRows,
  buildCatalogProductRows
} from "../src/catalog/supabase-rows.js";

const envPath = resolve(process.cwd(), ".env.local");
const dryRun = process.argv.includes("--dry-run");
const sqlArgIndex = process.argv.findIndex((argument) => argument === "--write-sql");
const sqlOutputPath =
  sqlArgIndex >= 0 ? process.argv[sqlArgIndex + 1] : null;

function loadLocalEnv() {
  let content = "";

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

function chunk(values, size = 50) {
  const chunks = [];

  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }

  return chunks;
}

async function assertNoSupabaseError(request, label) {
  const response = await request;

  if (response.error) {
    throw new Error(`${label}: ${response.error.message}`);
  }

  return response;
}

async function upsertInChunks(client, table, rows, options = {}) {
  for (const rowsChunk of chunk(rows)) {
    await assertNoSupabaseError(client.from(table).upsert(rowsChunk, options), table);
  }
}

function sqlString(value) {
  return `'${String(value ?? "").replace(/'/g, "''")}'`;
}

function sqlTextArray(values) {
  return `array[${values.map(sqlString).join(", ")}]::text[]`;
}

function sqlJsonb(value) {
  return `${sqlString(JSON.stringify(value ?? {}))}::jsonb`;
}

function buildSeedSql({ categoryRows, productRows, relationRows }) {
  const categoryValues = categoryRows
    .map(
      (category) =>
        `(${sqlString(category.id)}, ${sqlString(category.label)}, ${sqlString(category.slug)}, ${category.sort_order}, ${category.is_visible})`
    )
    .join(",\n");
  const productValues = productRows
    .map(
      (product) =>
        `(${sqlString(product.id)}, ${sqlString(product.slug)}, ${sqlString(product.name)}, ${sqlTextArray(product.storefront_category_ids)}, ${sqlString(product.product_family)}, ${sqlTextArray(product.bike_model_scope)}, ${product.price_cents}, ${sqlString(product.currency)}, ${sqlTextArray(product.variations)}, ${sqlString(product.availability)}, ${product.lead_time_days}, ${sqlString(product.shipping_class)}, ${sqlString(product.checkout_channel)}, ${sqlJsonb(product.internal_purchase_source)}, ${sqlString(product.notes)}, ${product.is_published})`
    )
    .join(",\n");
  const relationValues = relationRows
    .map((relation) => `(${sqlString(relation.product_id)}, ${sqlString(relation.category_id)})`)
    .join(",\n");
  const productIds = productRows.map((product) => product.id);

  return `begin;

insert into public.catalog_categories (
  id, label, slug, sort_order, is_visible
) values
${categoryValues}
on conflict (id) do update set
  label = excluded.label,
  slug = excluded.slug,
  sort_order = excluded.sort_order,
  is_visible = excluded.is_visible;

insert into public.catalog_products (
  id, slug, name, storefront_category_ids, product_family, bike_model_scope,
  price_cents, currency, variations, availability, lead_time_days, shipping_class,
  checkout_channel, internal_purchase_source, notes, is_published
) values
${productValues}
on conflict (id) do update set
  slug = excluded.slug,
  name = excluded.name,
  storefront_category_ids = excluded.storefront_category_ids,
  product_family = excluded.product_family,
  bike_model_scope = excluded.bike_model_scope,
  price_cents = excluded.price_cents,
  currency = excluded.currency,
  variations = excluded.variations,
  availability = excluded.availability,
  lead_time_days = excluded.lead_time_days,
  shipping_class = excluded.shipping_class,
  checkout_channel = excluded.checkout_channel,
  internal_purchase_source = excluded.internal_purchase_source,
  notes = excluded.notes,
  is_published = excluded.is_published;

delete from public.catalog_product_categories
where product_id = any(${sqlTextArray(productIds)});

insert into public.catalog_product_categories (
  product_id, category_id
) values
${relationValues}
on conflict (product_id, category_id) do nothing;

commit;

select
  (select count(*) from public.catalog_categories where is_visible = true) as visible_categories,
  (select count(*) from public.catalog_products where is_published = true) as published_products,
  (select count(*) from public.catalog_product_categories) as product_category_links;
`;
}

async function main() {
  loadLocalEnv();

  const catalogIssues = validateCatalog();

  if (catalogIssues.length > 0) {
    throw new Error(`Catalogo local invalido:\n${catalogIssues.join("\n")}`);
  }

  const categoryRows = buildCatalogCategoryRows();
  const productRows = buildCatalogProductRows();
  const relationRows = buildCatalogProductCategoryRows();

  if (dryRun) {
    console.log(
      `Dry run: ${categoryRows.length} categorias, ${productRows.length} produtos e ${relationRows.length} vinculos prontos para sincronizar.`
    );
    return;
  }

  if (sqlOutputPath) {
    const outputPath = resolve(process.cwd(), sqlOutputPath);

    mkdirSync(resolve(outputPath, ".."), { recursive: true });
    writeFileSync(outputPath, buildSeedSql({ categoryRows, productRows, relationRows }), "utf8");
    console.log(`SQL de seed gerado em ${sqlOutputPath}.`);
    return;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("Configure NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_URL, alem de SUPABASE_SERVICE_ROLE_KEY ou SUPABASE_SECRET_KEY no .env.local.");
  }

  if (getJwtRole(serviceRoleKey) === "anon") {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY esta com uma chave anon. Use a service_role real ou gere SQL com: npm run sync:catalog -- --write-sql supabase/.temp/catalog-seed.sql"
    );
  }

  const client = createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  await upsertInChunks(client, "catalog_categories", categoryRows, { onConflict: "id" });
  await upsertInChunks(client, "catalog_products", productRows, { onConflict: "id" });

  const productIds = catalogProducts.map((product) => product.id);
  await assertNoSupabaseError(
    client.from("catalog_product_categories").delete().in("product_id", productIds),
    "limpar vinculos de categorias"
  );
  await upsertInChunks(client, "catalog_product_categories", relationRows, {
    onConflict: "product_id,category_id"
  });

  const { data: syncedRows, error: syncedError } = await client
    .from("catalog_products")
    .select("id")
    .in("id", productIds);

  if (syncedError) {
    throw new Error(`validar produtos sincronizados: ${syncedError.message}`);
  }

  const syncedIds = new Set(syncedRows.map((row) => row.id));
  const missingIds = productIds.filter((id) => !syncedIds.has(id));

  if (missingIds.length > 0) {
    throw new Error(`Produtos nao encontrados apos sincronizacao: ${missingIds.join(", ")}`);
  }

  console.log(
    `Catalogo sincronizado no Supabase: ${categoryRows.length} categorias, ${productRows.length} produtos publicados e ${relationRows.length} vinculos.`
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
