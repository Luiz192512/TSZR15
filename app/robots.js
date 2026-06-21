const siteUrl = "https://www.tszr15-store.com.br";

export default function robots() {
  return {
    host: siteUrl,
    rules: [
      { allow: "/", userAgent: "*" },
      { disallow: ["/admin", "/conta", "/pedido", "/rastreio"], userAgent: "*" }
    ],
    sitemap: `${siteUrl}/sitemap.xml`
  };
}
