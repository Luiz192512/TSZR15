import globalStyles from "@/src/styles/storefront-styles.js";
import { cx } from "@/src/lib/classnames";
import styles from "./catalog-skeleton.module.css";

export function CatalogSkeleton({ label = "Carregando catálogo" }) {
  return (
    <main aria-busy="true" aria-label={label} className={cx(globalStyles, styles.page)}>
      <div className={cx(globalStyles, styles.hero)} />
      <section className={cx(globalStyles, styles.band)}>
        <div className={cx(globalStyles, styles.heading)} />
        <div className={cx(globalStyles, styles.feature)} />
      </section>
      <section className={cx(globalStyles, styles.catalog)}>
        <div className={cx(globalStyles, styles.heading)} />
        <div className={cx(globalStyles, styles.cards)}>
          {["a", "b", "c", "d"].map((key) => (
            <div className={cx(globalStyles, styles.card)} key={key} />
          ))}
        </div>
      </section>
    </main>
  );
}
