import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

const migrationsUrl = new URL("../supabase/migrations/", import.meta.url);

test("catalog migration persists ordered images for every variation", async () => {
  const migrationNames = await readdir(migrationsUrl);
  const migrationName = migrationNames.find((name) =>
    name.endsWith("_catalog_variation_images.sql")
  );

  assert.ok(migrationName, "migration catalog_variation_images não encontrada");

  const sql = await readFile(new URL(migrationName, migrationsUrl), "utf8");

  assert.match(sql, /add column if not exists variation_images jsonb/i);
  assert.match(sql, /jsonb_typeof\(variation_images\) = 'array'/i);
  assert.match(sql, /image_urls/i);
  assert.match(sql, /variations/i);
});
