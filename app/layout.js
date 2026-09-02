import "./globals.css";

import { AuthHashBridge } from "@/src/auth/auth-hash-bridge.js";
import { NavigationLoadingOverlay } from "@/src/components/loading/navigation-loading-overlay.js";
import { MobileTabBar } from "@/src/components/mobile-tab-bar.js";
import { SiteFooter } from "@/src/components/site-footer.js";
import { themeInitScript } from "@/src/components/theme/theme-script.js";

export const metadata = {
  metadataBase: new URL("https://www.tszr15-store.com.br"),
  title: "TSZR15 | Loja R15 com conta de cliente",
  description:
    "Catalogo Yamaha R15 com busca, conta de cliente, dados de entrega e fechamento via WhatsApp Business.",
  icons: {
    icon: "/brand/logo-tszr15-store.png"
  }
};

export default function RootLayout({ children }) {
  return (
    // suppressHydrationWarning: o script abaixo escreve data-theme no <html>
    // antes da hidratacao, entao o atributo do servidor e do cliente divergem
    // por construcao. E so este atributo — nada mais no documento e suprimido.
    <html data-scroll-behavior="smooth" lang="pt-BR" suppressHydrationWarning>
      <head>
        {/* Antes do primeiro paint: o HTML vem do Worker sem saber o tema
            escolhido, e sem isto a página piscaria clara antes de escurecer. */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <AuthHashBridge />
        <NavigationLoadingOverlay />
        {children}
        <SiteFooter />
        <MobileTabBar />
      </body>
    </html>
  );
}
