/** @type {import('next').NextConfig} */
const nextConfig = {
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
