import "./globals.css";

export const metadata = {
  title: "TSZR15",
  description: "Catalogo Yamaha R15 com base para configurador 3D e vitrine Next.js."
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
