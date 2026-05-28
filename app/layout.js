import "./globals.css";

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
      <body>{children}</body>
    </html>
  );
}
