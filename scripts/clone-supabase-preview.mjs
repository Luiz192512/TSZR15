import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient } from "@supabase/supabase-js";

const envPath = resolve(process.cwd(), ".env.local");
const dryRun = process.argv.includes("--dry-run");
const replace = process.argv.includes("--replace");
const preserveCouponRedemptions = process.argv.includes("--preserve-coupon-redemptions");

const cloneTables = [
  {
    deleteColumn: "id",
    name: "catalog_categories",
    onConflict: "id"
  },
  {
    deleteColumn: "id",
    name: "catalog_products",
    onConflict: "id"
  },
  {
    deleteColumn: "product_id",
    name: "catalog_product_categories",
    onConflict: "product_id,category_id"
  },
  {
    deleteColumn: "product_id",
    name: "catalog_product_costs",
    onConflict: "product_id"
  },
  {
    deleteColumn: "code",
    name: "catalog_coupons",
    onConflict: "code",
    transformRows(rows) {
      return rows.map((row) => {
        const { id: _id, ...coupon } = row;

        return {
          ...coupon,
          redemption_count: preserveCouponRedemptions ? coupon.redemption_count : 0
        };
      });
    }
  }
];

const deleteOrder = [
  "catalog_product_categories",
  "catalog_product_costs",
  "catalog_coupons",
  "catalog_products",
  "catalog_categories"
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

function firstEnv(keys) {
  return keys.map((key) => process.env[key]).find(Boolean) ?? "";
}

function getProjectRef(url) {
  return String(url ?? "").match(/^https:\/\/([^.]+)\.supabase\.co/)?.[1] ?? "";
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

function createServiceClient({ key, label, url }) {
  if (!url || !key) {
    throw new Error(`Configure URL e service role do Supabase ${label}.`);
  }

  if (getJwtRole(key) === "anon") {
    throw new Error(`A chave do Supabase ${label} parece ser anon. Use service_role.`);
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

function chunk(values, size = 100) {
  const chunks = [];

  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }

  return chunks;
}

async function fetchAllRows(client, tableName) {
  const rows = [];
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    const { data, error } = await client.from(tableName).select("*").range(from, to);

    if (error) {
      throw new Error(`Ler ${tableName}: ${error.message}`);
    }

    rows.push(...(data ?? []));

    if (!data || data.length < pageSize) {
      return rows;
    }
  }
}

async function deleteTableRows(client, table) {
  const { error } = await client.from(table.name).delete().not(table.deleteColumn, "is", null);

  if (error) {
    throw new Error(`Limpar ${table.name}: ${error.message}`);
  }
}

async function upsertTableRows(client, table, rows) {
  if (rows.length === 0) {
    return;
  }

  for (const rowsChunk of chunk(rows)) {
    const { error } = await client.from(table.name).upsert(rowsChunk, {
      onConflict: table.onConflict
    });

    if (error) {
      throw new Error(`Salvar ${table.name}: ${error.message}`);
    }
  }
}

async function main() {
  loadLocalEnv();

  const sourceUrl = firstEnv(["SUPABASE_SOURCE_URL", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL"]);
  const sourceKey = firstEnv([
    "SUPABASE_SOURCE_SERVICE_ROLE_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_SECRET_KEY"
  ]);
  const previewUrl = firstEnv(["NEXT_PUBLIC_SUPABASE_PREVIEW_URL", "SUPABASE_PREVIEW_URL"]);
  const previewKey = firstEnv(["SUPABASE_PREVIEW_SERVICE_ROLE_KEY", "SUPABASE_PREVIEW_SECRET_KEY"]);
  const sourceRef = getProjectRef(sourceUrl);
  const previewRef = getProjectRef(previewUrl);

  if (!sourceRef || !previewRef) {
    throw new Error("Configure URLs Supabase validas para origem e preview.");
  }

  if (sourceRef === previewRef) {
    throw new Error("Origem e preview apontam para o mesmo projeto. Clone cancelado.");
  }

  const source = createServiceClient({ key: sourceKey, label: "origem", url: sourceUrl });
  const preview = createServiceClient({ key: previewKey, label: "preview", url: previewUrl });
  const clonedRows = new Map();

  for (const table of cloneTables) {
    const sourceRows = await fetchAllRows(source, table.name);
    const rows = table.transformRows ? table.transformRows(sourceRows) : sourceRows;

    clonedRows.set(table.name, rows);
  }

  if (dryRun) {
    for (const table of cloneTables) {
      console.log(`${table.name}: ${clonedRows.get(table.name).length} linha(s) prontas`);
    }

    console.log("Dry run concluido. Nada foi escrito no preview.");
    return;
  }

  if (replace) {
    for (const tableName of deleteOrder) {
      const table = cloneTables.find((entry) => entry.name === tableName);

      await deleteTableRows(preview, table);
    }
  }

  for (const table of cloneTables) {
    await upsertTableRows(preview, table, clonedRows.get(table.name));
  }

  for (const table of cloneTables) {
    console.log(`${table.name}: ${clonedRows.get(table.name).length} linha(s) clonadas`);
  }

  console.log(
    "Clone seguro concluido. Nao foram clonados usuarios, pedidos, pagamentos, rastreios, avaliacoes, fotos privadas ou logs."
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
