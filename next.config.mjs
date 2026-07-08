/** @type {import('next').NextConfig} */
const nextConfig = {
  // Nenhuma rota usa next/og (ImageResponse); sem esta exclusão o tracing
  // arrasta ~1,4 MiB de WASM para o worker do Cloudflare (limite de 3 MiB).
  outputFileTracingExcludes: {
    "*": ["node_modules/next/dist/compiled/@vercel/og/**"]
  },
  images: {
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 31536000,
    remotePatterns: [
      {
        hostname: "mckthvbwddxipghumrpw.supabase.co",
        pathname: "/storage/v1/object/public/**",
        protocol: "https"
      }
    ]
  },
  reactStrictMode: true
};

export default nextConfig;
