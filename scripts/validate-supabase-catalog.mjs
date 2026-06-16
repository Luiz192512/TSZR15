import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient } from "@supabase/supabase-js";

import { storefrontCategories, storefrontCategoryMap, technicalFamilies } from "../src/catalog/categories.js";
import {
  getSupabasePublishableKey,
  getSupabaseServiceRoleKey,
  getSupabaseUrl
} from "../src/lib/supabase/config.js";

const envPath = resolve(process.cwd(), ".env.local");
const targetArgIndex = process.argv.findIndex((argument) => argument === "--target");
const targetArg = targetArgIndex >= 0 ? process.argv[targetArgIndex + 1] : null;

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

function arrayValue(value) {
  return Array.isArray(value) ? value : [];
}

function setDifference(left, right) {
  const rightSet = new Set(right);

  return left.filter((item) => !rightSet.has(item));
}

function isValidImageUrl(value) {
  if (String(value).startsWith("/")) {
    return true;
  }

  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

async function readTable(client, tableName, columns = "*") {
  const { data, error } = await client
    .from(tableName)
    .select(columns, { count: "exact" })
    .limit(1000);

  if (error) {
    throw new Error(`${tableName}: ${error.message}`);
  }

  return data ?? [];
}

function validateDuplicate(values, label, issues) {
  const seen = new Set();
  const duplicates = new Set();

  for (const value of values) {
    if (!value) {
      continue;
    }

    if (seen.has(value)) {
      duplicates.add(value);
    }

    seen.add(value);
  }

  if (duplicates.size > 0) {
    issues.push(`${label} duplicado(s): ${[...duplicates].join(", ")}`);
  }
}

function validateProducts({ categoryIdsInDatabase, issues, products, relationRows, warnings }) {
  const productIds = new Set(products.map((product) => product.id));
  const relationMap = new Map();

  for (const relation of relationRows) {
    if (!productIds.has(relation.product_id)) {
      issues.push(`Vinculo de categoria referencia produto inexistente: ${relation.product_id}`);
    }

    if (!categoryIdsInDatabase.has(relation.category_id)) {
      issues.push(`Vinculo de categoria referencia categoria inexistente: ${relation.category_id}`);
    }

    const categories = relationMap.get(relation.product_id) ?? [];
    categories.push(relation.category_id);
    relationMap.set(relation.product_id, categories);
  }

  validateDuplicate(
    products.map((product) => product.id),
    "ID de produto",
    issues
  );
  validateDuplicate(
    products.map((product) => product.slug),
    "Slug de produto",
    issues
  );

  for (const product of products) {
    const prefix = `Produto ${product.id || "(sem id)"}`;
    const categoryIds = arrayValue(product.storefront_category_ids);
    const relationCategoryIds = relationMap.get(product.id) ?? [];
    const imageUrls = arrayValue(product.image_urls);

    if (!product.id) {
      issues.push("Produto sem id.");
    }

    if (!product.slug) {
      issues.push(`${prefix}: slug ausente.`);
    }

    if (!product.name) {
      issues.push(`${prefix}: nome ausente.`);
    }

    if (!product.is_published) {
      warnings.push(`${prefix}: esta arquivado no Supabase.`);
    }

    if (categoryIds.length === 0) {
      issues.push(`${prefix}: sem categoria de vitrine.`);
    }

    for (const categoryId of categoryIds) {
      if (!storefrontCategoryMap.has(categoryId)) {
        issues.push(`${prefix}: categoria desconhecida no codigo: ${categoryId}.`);
      }

      if (!categoryIdsInDatabase.has(categoryId)) {
        issues.push(`${prefix}: categoria ausente no Supabase: ${categoryId}.`);
      }
    }

    const missingRelations = setDifference(categoryIds, relationCategoryIds);
    const extraRelations = setDifference(relationCategoryIds, categoryIds);

    if (missingRelations.length > 0) {
      issues.push(`${prefix}: sem vinculo em catalog_product_categories para ${missingRelations.join(", ")}.`);
    }

    if (extraRelations.length > 0) {
      issues.push(`${prefix}: vinculo extra em catalog_product_categories para ${extraRelations.join(", ")}.`);
    }

    if (!technicalFamilies.includes(product.product_family)) {
      issues.push(`${prefix}: familia tecnica invalida (${product.product_family}).`);
    }

    if (!Number.isInteger(product.price_cents) || product.price_cents <= 0) {
      issues.push(`${prefix}: preco invalido.`);
    }

    if (product.currency !== "BRL") {
      issues.push(`${prefix}: moeda invalida (${product.currency}).`);
    }

    if (product.checkout_channel !== "whatsapp-business") {
      issues.push(`${prefix}: checkout_channel invalido (${product.checkout_channel}).`);
    }

    if (!Number.isInteger(product.lead_time_days) || product.lead_time_days < 0) {
      issues.push(`${prefix}: prazo em dias uteis invalido.`);
    }

    if (arrayValue(product.variations).length === 0) {
      issues.push(`${prefix}: sem variacoes.`);
    }

    if (arrayValue(product.bike_model_scope).length === 0) {
      issues.push(`${prefix}: sem escopo de moto.`);
    }

    const invalidImageUrl = imageUrls.find((imageUrl) => !isValidImageUrl(imageUrl));

    if (invalidImageUrl) {
      issues.push(`${prefix}: URL de imagem invalida (${invalidImageUrl}).`);
    }

    if (imageUrls.length === 0 && product.is_published) {
      warnings.push(`${prefix}: publicado sem imagem cadastrada.`);
    }
  }
}

function validateCosts({ costs, issues, products, warnings }) {
  const productsById = new Map(products.map((product) => [product.id, product]));
  const costsByProductId = new Map(costs.map((cost) => [cost.product_id, cost]));

  for (const cost of costs) {
    const product = productsById.get(cost.product_id);

    if (!product) {
      issues.push(`Custo referencia produto inexistente: ${cost.product_id}.`);
      continue;
    }

    if (!Number.isInteger(cost.cost_cents) || cost.cost_cents < 0) {
      issues.push(`Produto ${cost.product_id}: custo invalido.`);
    }

    if (cost.currency !== "BRL") {
      issues.push(`Produto ${cost.product_id}: moeda de custo invalida (${cost.currency}).`);
    }

    if (Number.isInteger(cost.cost_cents) && cost.cost_cents >= product.price_cents) {
      warnings.push(`Produto ${cost.product_id}: custo maior ou igual ao preco de venda.`);
    }
  }

  for (const product of products.filter((item) => item.is_published)) {
    if (!costsByProductId.has(product.id)) {
      warnings.push(`Produto ${product.id}: publicado sem custo interno.`);
    }
  }
}

function validateCoupons({ categoryIdsInDatabase, coupons, issues, productIds, warnings }) {
  validateDuplicate(
    coupons.map((coupon) => coupon.code),
    "Codigo de cupom",
    issues
  );

  for (const coupon of coupons) {
    const prefix = `Cupom ${coupon.code || "(sem codigo)"}`;
    const productIdsScope = arrayValue(coupon.applies_to_product_ids);
    const categoryIdsScope = arrayValue(coupon.applies_to_category_ids);

    if (!/^[A-Z0-9_-]{3,40}$/.test(coupon.code ?? "")) {
      issues.push(`${prefix}: codigo invalido.`);
    }

    if (coupon.discount_type === "percent") {
      if (
        !Number.isInteger(coupon.discount_percent) ||
        coupon.discount_percent < 1 ||
        coupon.discount_percent > 100 ||
        coupon.discount_cents !== null
      ) {
        issues.push(`${prefix}: desconto percentual invalido.`);
      }
    } else if (coupon.discount_type === "fixed") {
      if (
        !Number.isInteger(coupon.discount_cents) ||
        coupon.discount_cents <= 0 ||
        coupon.discount_percent !== null
      ) {
        issues.push(`${prefix}: desconto fixo invalido.`);
      }
    } else {
      issues.push(`${prefix}: tipo de desconto invalido (${coupon.discount_type}).`);
    }

    if (!Number.isInteger(coupon.minimum_subtotal_cents) || coupon.minimum_subtotal_cents < 0) {
      issues.push(`${prefix}: subtotal minimo invalido.`);
    }

    if (!Number.isInteger(coupon.redemption_count) || coupon.redemption_count < 0) {
      issues.push(`${prefix}: contador de usos invalido.`);
    }

    if (coupon.max_redemptions !== null && (!Number.isInteger(coupon.max_redemptions) || coupon.max_redemptions <= 0)) {
      issues.push(`${prefix}: limite de usos invalido.`);
    }

    if (coupon.starts_at && coupon.expires_at && new Date(coupon.expires_at) <= new Date(coupon.starts_at)) {
      issues.push(`${prefix}: data de expiracao anterior ao inicio.`);
    }

    for (const productId of productIdsScope) {
      if (!productIds.has(productId)) {
        issues.push(`${prefix}: referencia produto inexistente (${productId}).`);
      }
    }

    for (const categoryId of categoryIdsScope) {
      if (!storefrontCategoryMap.has(categoryId) || !categoryIdsInDatabase.has(categoryId)) {
        issues.push(`${prefix}: referencia categoria inexistente (${categoryId}).`);
      }
    }

    if (coupon.is_active && productIdsScope.length === 0 && categoryIdsScope.length === 0) {
      warnings.push(`${prefix}: ativo e aplicavel ao carrinho inteiro.`);
    }
  }
}

async function validatePublicRead({ expectedPublishedCount, issues, publishableKey, url }) {
  if (!publishableKey) {
    issues.push("Chave publica Supabase ausente; leitura publica nao validada.");
    return null;
  }

  const publicClient = createClient(url, publishableKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  const { count, error } = await publicClient
    .from("catalog_products")
    .select("id", { count: "exact", head: true })
    .eq("is_published", true);

  if (error) {
    issues.push(`Leitura publica de catalog_products falhou: ${error.message}`);
    return null;
  }

  if (count !== expectedPublishedCount) {
    issues.push(
      `Leitura publica retornou ${count ?? 0} produtos publicados, mas service_role encontrou ${expectedPublishedCount}.`
    );
  }

  return count ?? 0;
}

async function main() {
  loadLocalEnv();

  if (targetArg) {
    process.env.SUPABASE_RUNTIME_TARGET = targetArg;
  }

  const url = getSupabaseUrl();
  const serviceRoleKey = getSupabaseServiceRoleKey();
  const publishableKey = getSupabasePublishableKey();

  if (!url || !serviceRoleKey) {
    throw new Error("Configure NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.local.");
  }

  if (getJwtRole(serviceRoleKey) === "anon") {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY esta com uma chave anon. Use a service_role real.");
  }

  const client = createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  const [categories, products, relationRows, costs, coupons] = await Promise.all([
    readTable(client, "catalog_categories"),
    readTable(client, "catalog_products"),
    readTable(client, "catalog_product_categories"),
    readTable(client, "catalog_product_costs"),
    readTable(client, "catalog_coupons")
  ]);

  const issues = [];
  const warnings = [];
  const expectedCategoryIds = new Set(storefrontCategories.map((category) => category.id));
  const categoryIdsInDatabase = new Set(categories.map((category) => category.id));
  const productIds = new Set(products.map((product) => product.id));
  const publishedProducts = products.filter((product) => product.is_published);

  for (const expectedCategoryId of expectedCategoryIds) {
    if (!categoryIdsInDatabase.has(expectedCategoryId)) {
      issues.push(`Categoria obrigatoria ausente no Supabase: ${expectedCategoryId}.`);
    }
  }

  validateDuplicate(
    categories.map((category) => category.id),
    "ID de categoria",
    issues
  );
  validateDuplicate(
    categories.map((category) => category.slug),
    "Slug de categoria",
    issues
  );

  validateProducts({ categoryIdsInDatabase, issues, products, relationRows, warnings });
  validateCosts({ costs, issues, products, warnings });
  validateCoupons({ categoryIdsInDatabase, coupons, issues, productIds, warnings });

  const publicPublishedCount = await validatePublicRead({
    expectedPublishedCount: publishedProducts.length,
    issues,
    publishableKey,
    url
  });

  const summary = {
    categories: categories.length,
    costs: costs.length,
    coupons: coupons.length,
    productCategoryLinks: relationRows.length,
    products: products.length,
    publishedProducts: publishedProducts.length,
    publicPublishedProducts: publicPublishedCount
  };

  if (issues.length > 0) {
    console.error("Supabase catalog validation failed:");
    for (const issue of issues) {
      console.error(`- ${issue}`);
    }

    if (warnings.length > 0) {
      console.error("\nWarnings:");
      for (const warning of warnings) {
        console.error(`- ${warning}`);
      }
    }

    console.error(`\nResumo: ${JSON.stringify(summary)}`);
    process.exit(1);
  }

  console.log(
    `Supabase catalog validation passed: ${summary.products} produtos (${summary.publishedProducts} publicados), ${summary.categories} categorias, ${summary.productCategoryLinks} vinculos, ${summary.costs} custos e ${summary.coupons} cupons.`
  );

  if (summary.publicPublishedProducts !== null) {
    console.log(`Leitura publica validada: ${summary.publicPublishedProducts} produtos publicados visiveis.`);
  }

  if (warnings.length > 0) {
    console.log("\nWarnings:");
    for (const warning of warnings) {
      console.log(`- ${warning}`);
    }
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
