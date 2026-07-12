import globalStyles from "@/app/storefront.module.css";
import { cx } from "@/src/lib/classnames";

export function ProductVariationEditor({ defaultValue = "Padrão=" }) {
  return (
    <label className={cx(globalStyles, "admin-variation-editor span-all")}>
      <span>Variações e estoque</span>
      <textarea
        aria-label="Variações e estoque"
        defaultValue={defaultValue}
        name="variationInventory"
        required
        rows={5}
      />
      <small>
        Uma por linha no formato <code>Variação=quantidade</code>. Deixe após o
        = vazio para “sob consulta”; use 0 quando estiver esgotado.
      </small>
    </label>
  );
}
