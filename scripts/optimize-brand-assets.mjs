// Gera versoes .webp dos assets de marca em public/brand.
//
// Contexto: o otimizador /_next/image nao roda no worker do OpenNext/Cloudflare
// (next.config.mjs usa images.unoptimized). Sem ele, o hero PNG (~1,15 MB) e o
// logo PNG (~399 KB) iam crus para o navegador. Este script pre-gera .webp
// dimensionados que sao servidos como assets estaticos por public/brand.
//
// Uso: node scripts/optimize-brand-assets.mjs
// Idempotente: sobrescreve os .webp de saida.

import { writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import sharp from "sharp";

const brandDir = resolve(process.cwd(), "public", "brand");
const webpQuality = 84;

// Fonte do hero da home hoje hospedada no Supabase brand-assets. Baixamos uma
// vez para gerar a versao local dimensionada.
const heroSourceUrl =
  "https://mckthvbwddxipghumrpw.supabase.co/storage/v1/object/public/brand-assets/tszr15-hero-r15-dark.png";

const targets = [
  {
    label: "logo",
    input: { type: "file", path: resolve(brandDir, "logo-tszr15-store.png") },
    output: resolve(brandDir, "logo-tszr15-store.webp"),
    maxWidth: 600
  },
  {
    label: "hero",
    input: { type: "url", url: heroSourceUrl },
    output: resolve(brandDir, "tszr15-hero-r15-dark.webp"),
    maxWidth: 1600
  },
  // O icone da aba sai em PNG, nao em webp: o webp so vale a pena quando o
  // navegador escolhe entre formatos, e para favicon nao ha negociacao — quem
  // nao entende o formato fica sem icone. PNG pequeno e universal.
  {
    label: "icone da aba",
    format: "png",
    input: { type: "file", path: resolve(brandDir, "logo-tszr15-store.png") },
    output: resolve(brandDir, "icon-32.png"),
    maxWidth: 32
  },
  {
    label: "icone do atalho iOS",
    format: "png",
    input: { type: "file", path: resolve(brandDir, "logo-tszr15-store.png") },
    output: resolve(brandDir, "icon-180.png"),
    maxWidth: 180
  }
];

async function loadInput(input) {
  if (input.type === "file") {
    return readFileSync(input.path);
  }

  const response = await fetch(input.url);

  if (!response.ok) {
    throw new Error(`Falha ao baixar ${input.url}: HTTP ${response.status}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

async function run() {
  for (const target of targets) {
    const source = await loadInput(target.input);
    const redimensionado = sharp(source).resize({
      width: target.maxWidth,
      withoutEnlargement: true
    });
    const output = await (target.format === "png"
      ? redimensionado.png({ compressionLevel: 9 })
      : redimensionado.webp({ quality: webpQuality })
    ).toBuffer();

    await writeFile(target.output, output);

    const kb = (output.length / 1024).toFixed(1);
    console.log(`${target.label}: ${target.output} (${kb} KB)`);
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
