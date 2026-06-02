import "./globals.css";

import { SpeedInsights } from "@vercel/speed-insights/next";

import { AuthHashBridge } from "@/src/auth/auth-hash-bridge.js";
import { NavigationLoadingOverlay } from "@/src/components/loading/navigation-loading-overlay.js";

export const metadata = {
  title: "TSZR15 | Loja R15 com conta de cliente",
  description:
    "Catalogo Yamaha R15 com busca, conta de cliente, dados de entrega e fechamento via WhatsApp Business.",
  icons: {
    icon: "/brand/logo-tszr15-store.png"
  }
};

export default function RootLayout({ children }) {
  return (
    <html data-scroll-behavior="smooth" lang="pt-BR">
      <body>
        <AuthHashBridge />
        <NavigationLoadingOverlay />
        {children}
        <SpeedInsights />
      </body>
    </html>
  );
}
