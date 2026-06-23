import globalStyles from "@/app/storefront.module.css";
import { cx } from "@/src/lib/classnames";
export function Tszr15Loader({ label = "Carregando TSZR15" }) {
  return (
    <section className={cx(globalStyles, "tszr-loader-shell")} role="status" aria-live="polite">
      <div className={cx(globalStyles, "tszr-loader-card")}>
        <div className={cx(globalStyles, "tszr-loader-mark")} aria-hidden="true">
          <span />
          <i />
        </div>
        <div>
          <strong>{label}</strong>
          <p>Preparando dados, pedidos e catalogo.</p>
        </div>
        <div className={cx(globalStyles, "tszr-loader-bars")} aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </div>
    </section>
  );
}
