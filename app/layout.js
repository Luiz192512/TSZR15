import "./globals.css";

export const metadata = {
  title: "TSZR15 | Loja R15 com conta de cliente",
  description:
    "Catalogo Yamaha R15 com busca, conta de cliente, dados de entrega e fechamento via WhatsApp Business."
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
