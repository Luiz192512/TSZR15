import "./globals.css";

import { Archivo } from "next/font/google";

import { AuthHashBridge } from "@/src/auth/auth-hash-bridge.js";
import { NavigationLoadingOverlay } from "@/src/components/loading/navigation-loading-overlay.js";
import { MobileTabBar } from "@/src/components/mobile-tab-bar.js";
import { SiteFooter } from "@/src/components/site-footer.js";
import { themeInitScript } from "@/src/components/theme/theme-script.js";

// A loja declarava `Bahnschrift, "Segoe UI Variable", "Segoe UI"` — as tres da
// Microsoft. No Android o texto caia em Roboto, no iPhone em San Francisco: a
// tipografia existia na maquina do dono e em quase nenhum cliente.
//
// Archivo: grotesca tecnica, proxima do desenho da Bahnschrift, e VARIAVEL no
// peso — o CSS usa 750, 850 e 950, valores que so existem entre os passos de uma
// fonte variavel. Numa estatica eles arredondam e o contraste entre os niveis de
// titulo desaparece.
//
// O eixo de LARGURA foi testado e recusado: `axes: ["wdth"]` devolveria a
// proporcao condensada da Bahnschrift, mas o arquivo pre-carregado sobe de
// 34,1 KB para 88,0 KB — 54 KB no caminho critico de uma loja que ja carrega
// 341 KB de JavaScript. Se alguma caixa estourar com o texto mais largo, o eixo
// esta a uma linha de distancia, e o preco esta medido aqui.
//
// `next/font` baixa e serve a fonte do proprio dominio no build, entao nao ha
// requisicao ao Google em tempo de execucao e a CSP (`font-src 'self' data:`)
// continua como esta.
const fonteDaMarca = Archivo({
  display: "swap",
  subsets: ["latin"],
  variable: "--fonte-marca"
});

export const metadata = {
  metadataBase: new URL("https://www.tszr15-store.com.br"),
  title: "TSZR15 | Loja R15 com conta de cliente",
  description:
    "Catalogo Yamaha R15 com busca, conta de cliente, dados de entrega e fechamento via WhatsApp Business.",
  // O icone apontava para o PNG de origem: 2000x2000 e 399 KB para preencher um
  // quadrado de 32 px na aba. Todo visitante baixava a arte inteira antes de ver
  // a loja. `scripts/optimize-brand-assets.mjs` gera as duas versoes abaixo.
  icons: {
    apple: "/brand/icon-180.png",
    icon: "/brand/icon-32.png"
  }
};

export default function RootLayout({ children }) {
  return (
    // suppressHydrationWarning: o script abaixo escreve data-theme no <html>
    // antes da hidratacao, entao o atributo do servidor e do cliente divergem
    // por construcao. E so este atributo — nada mais no documento e suprimido.
    <html
      className={fonteDaMarca.variable}
      data-scroll-behavior="smooth"
      lang="pt-BR"
      suppressHydrationWarning
    >
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
