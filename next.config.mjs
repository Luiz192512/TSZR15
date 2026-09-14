import { securityHeaders } from "./src/security/headers.js";

// O hostname do Supabase estava fixo no projeto de producao, entao imagem
// hospedada no projeto de preview era bloqueada pelo next/image e o staging
// aparecia sem foto de produto. Os dois hostnames sao derivados do ambiente:
// hostname que nao estiver configurado simplesmente nao entra na lista.
const SUPABASE_URL_ENV_KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PREVIEW_URL",
  "SUPABASE_PREVIEW_URL"
];

function supabaseImagePatterns() {
  const hostnames = new Set();

  for (const key of SUPABASE_URL_ENV_KEYS) {
    const hostname = String(process.env[key] ?? "").match(
      /^https:\/\/([a-z0-9-]+\.supabase\.co)/i
    )?.[1];

    if (hostname) {
      hostnames.add(hostname);
    }
  }

  // Fallback para o projeto de producao: `next build` roda em CI sem .env.local
  // e a lista vazia quebraria a vitrine publicada.
  if (hostnames.size === 0) {
    hostnames.add("mckthvbwddxipghumrpw.supabase.co");
  }

  return [...hostnames].map((hostname) => ({
    hostname,
    pathname: "/storage/v1/object/public/**",
    protocol: "https"
  }));
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Nenhuma rota usa next/og (ImageResponse); sem esta exclusão o tracing
  // arrasta ~1,4 MiB de WASM para o worker do Cloudflare (limite de 3 MiB).
  outputFileTracingExcludes: {
    "*": ["node_modules/next/dist/compiled/@vercel/og/**"]
  },
  images: {
    // O otimizador /_next/image nao roda no worker do OpenNext/Cloudflare: ele
    // devolve o arquivo original (sem redimensionar, sem webp/avif e sem
    // Cache-Control). A saida NAO e desligar o next/image: e trocar o otimizador
    // por um carregador que escolhe, entre as tres variantes ja geradas por
    // `scripts/optimize-product-images.mjs`, a que serve a largura pedida.
    //
    // Antes, com `unoptimized`, nao havia `srcset`: o celular recebia a mesma
    // variante do desktop. O carregador nao redimensiona em tempo de
    // requisicao, entao nada disso passa pelo worker.
    //
    // As listas abaixo sao as larguras que EXISTEM como arquivo. Deixar as
    // padroes do Next (16 valores, ate 3840 px) encheria o `srcset` de larguras
    // que cairiam todas na mesma variante.
    deviceSizes: [640, 1200],
    imageSizes: [200],
    loader: "custom",
    loaderFile: "./src/catalog/image-loader.js",
    remotePatterns: supabaseImagePatterns()
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders
      }
    ];
  },
  reactStrictMode: true
};

export default nextConfig;
