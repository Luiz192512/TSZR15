import { ImageResponse } from "next/og";

import { getPublicCatalogProductsForStorefront } from "@/src/catalog/supabase-catalog.js";

export const alt = "Produto TSZR15 para Yamaha R15";
export const contentType = "image/png";
export const runtime = "nodejs";
export const size = { height: 630, width: 1200 };

export default async function OpenGraphImage({ params }) {
  const { slug } = await params;
  const catalog = await getPublicCatalogProductsForStorefront();
  const product = catalog.products.find((item) => item.slug === slug);
  const imageUrl = product?.imageUrls?.[0] ?? null;
  const price = product
    ? new Intl.NumberFormat("pt-BR", { currency: "BRL", style: "currency" }).format(
        product.priceCents / 100
      )
    : "Peças e acessórios";

  return new ImageResponse(
    <div
      style={{
        alignItems: "stretch",
        background: "#080808",
        color: "white",
        display: "flex",
        height: "100%",
        position: "relative",
        width: "100%"
      }}
    >
      {imageUrl ? (
        <img
          alt=""
          height="630"
          src={imageUrl}
          style={{
            height: "630px",
            objectFit: "cover",
            opacity: 0.56,
            position: "absolute",
            width: "1200px"
          }}
          width="1200"
        />
      ) : null}
      <div
        style={{
          alignItems: "flex-start",
          background: "linear-gradient(90deg, rgba(5,5,5,0.98), rgba(5,5,5,0.56))",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "76px",
          position: "relative",
          width: "100%"
        }}
      >
        <div style={{ color: "#ff5158", display: "flex", fontSize: 28, fontWeight: 700 }}>
          TSZR15 · YAMAHA R15
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 68,
            fontWeight: 800,
            lineHeight: 1.05,
            marginTop: 22
          }}
        >
          {product?.name ?? "Produto TSZR15"}
        </div>
        <div style={{ color: "#f6f6f6", display: "flex", fontSize: 34, marginTop: 30 }}>
          {price}
        </div>
      </div>
    </div>,
    size
  );
}
