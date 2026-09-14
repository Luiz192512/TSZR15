// Build + deploy do Worker de staging com o alvo de ambiente fixado.
//
// O alvo precisa estar no ambiente do BUILD, nao so no do runtime: o Next
// inlina as variaveis NEXT_PUBLIC_* no bundle do navegador durante o build.
// Reaproveitar um build de producao no Worker de preview entregaria um bundle
// client apontando para o Supabase de producao.
//
// Uso: npm run deploy:preview

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const envPath = resolve(process.cwd(), ".env.local");

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

function fail(message) {
  console.error(`\n[deploy:preview] ${message}\n`);
  process.exit(1);
}

function run(command, args) {
  console.log(`[deploy:preview] ${command} ${args.join(" ")}`);

  const result = spawnSync(command, args, {
    env: process.env,
    shell: process.platform === "win32",
    stdio: "inherit"
  });

  if (result.status !== 0) {
    fail(`comando falhou: ${command} ${args.join(" ")}`);
  }
}

loadLocalEnv();

process.env.SUPABASE_RUNTIME_TARGET = "preview";
process.env.NEXT_PUBLIC_SUPABASE_RUNTIME_TARGET = "preview";

const previewUrl = firstEnv(["NEXT_PUBLIC_SUPABASE_PREVIEW_URL", "SUPABASE_PREVIEW_URL"]);
const productionUrl = firstEnv(["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL"]);

if (!previewUrl) {
  fail(
    "NEXT_PUBLIC_SUPABASE_PREVIEW_URL nao configurada. O staging precisa do proprio projeto Supabase (ver docs/AMBIENTES.md)."
  );
}

if (productionUrl && previewUrl === productionUrl) {
  fail(
    "NEXT_PUBLIC_SUPABASE_PREVIEW_URL aponta para o mesmo projeto de producao. Abortado antes do build."
  );
}

run("npx", ["opennextjs-cloudflare", "build"]);
run("npx", ["wrangler", "deploy", "--config", "wrangler.preview.jsonc"]);

console.log("\n[deploy:preview] staging publicado com alvo=preview.\n");
