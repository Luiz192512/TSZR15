import Image from "next/image";
import Link from "next/link";

import { cx } from "@/src/lib/classnames";
import styles from "./site-footer.module.css";

const storeName = process.env.NEXT_PUBLIC_STORE_NAME ?? "TSZR15";
const whatsappNumber = process.env.NEXT_PUBLIC_WHATSAPP_BUSINESS_NUMBER ?? "";

const storeLinks = [
  { href: "/", label: "Início" },
  { href: "/catalogo", label: "Produtos" },
  { href: "/#lancamentos", label: "Lançamentos" },
  { href: "/rastreio", label: "Rastrear pedido" }
];

// TODO: apontar para as paginas reais quando existirem (hoje sao stubs).
const institutionalLinks = [
  { href: "/trocas-e-devolucoes", label: "Trocas & Devoluções" },
  { href: "/privacidade", label: "Política de Privacidade" },
  { href: "/termos", label: "Termos de Uso" }
];

export function SiteFooter() {
  return (
    <footer className={cx(styles, "footer")}>
      <div className={cx(styles, "inner")}>
        <div className={cx(styles, "brand")}>
          <Image
            alt={storeName}
            className={cx(styles, "brandLogo")}
            height={120}
            src="/brand/logo-tszr15-store.webp"
            width={300}
          />
          <p className={cx(styles, "brandText")}>
            Peças e acessórios selecionados para Yamaha R15, com atendimento e fechamento direto no
            WhatsApp.
          </p>
        </div>

        <nav className={cx(styles, "column")} aria-label="Loja">
          <p className={cx(styles, "columnTitle")}>Loja</p>
          {storeLinks.map((item) => (
            <Link className={cx(styles, "link")} href={item.href} key={item.href}>
              {item.label}
            </Link>
          ))}
        </nav>

        <nav className={cx(styles, "column")} aria-label="Institucional">
          <p className={cx(styles, "columnTitle")}>Institucional</p>
          {institutionalLinks.map((item) => (
            <Link className={cx(styles, "link")} href={item.href} key={item.href}>
              {item.label}
            </Link>
          ))}
        </nav>

        <div className={cx(styles, "column")}>
          <p className={cx(styles, "columnTitle")}>Atendimento</p>
          {whatsappNumber ? (
            <a
              className={cx(styles, "whatsapp")}
              href={`https://wa.me/${whatsappNumber}`}
              rel="noopener noreferrer"
              target="_blank"
            >
              Falar no WhatsApp
            </a>
          ) : null}
        </div>
      </div>

      <div className={cx(styles, "legal")}>
        <span>
          © {new Date().getFullYear()} {storeName} · Todos os direitos reservados
        </span>
      </div>
    </footer>
  );
}
