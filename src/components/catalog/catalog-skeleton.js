import styles from "./catalog-skeleton.module.css";

export function CatalogSkeleton({ label = "Carregando catálogo" }) {
  return (
    <main aria-busy="true" aria-label={label} className={styles.page}>
      <div className={styles.hero} />
      <section className={styles.band}>
        <div className={styles.heading} />
        <div className={styles.feature} />
      </section>
      <section className={styles.catalog}>
        <div className={styles.heading} />
        <div className={styles.cards}>
          {["a", "b", "c", "d"].map((key) => (
            <div className={styles.card} key={key} />
          ))}
        </div>
      </section>
    </main>
  );
}
