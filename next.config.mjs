import { securityHeaders } from "./src/security/headers.js";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Nenhuma rota usa next/og (ImageResponse); sem esta exclusão o tracing
  // arrasta ~1,4 MiB de WASM para o worker do Cloudflare (limite de 3 MiB).
  outputFileTracingExcludes: {
    "*": ["node_modules/next/dist/compiled/@vercel/og/**"],
  },
  images: {
    // O otimizador /_next/image nao roda no worker do OpenNext/Cloudflare: ele
    // devolve o arquivo original (sem redimensionar, sem webp/avif e sem
    // Cache-Control). Com unoptimized, as <Image> apontam direto para a fonte:
    // as fotos de produto ja vem do Supabase como webp pre-otimizado com cache
    // de 1 ano (scripts/optimize-product-images.mjs) e os assets de marca sao
    // servidos como webp local por public/brand.
    unoptimized: true,
    remotePatterns: [
      {
        hostname: "mckthvbwddxipghumrpw.supabase.co",
        pathname: "/storage/v1/object/public/**",
        protocol: "https",
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
  reactStrictMode: true,
};

export default nextConfig;
