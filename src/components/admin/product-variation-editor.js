"use client";

import globalStyles from "@/app/storefront.module.css";
import { cx } from "@/src/lib/classnames";
import { useRef, useState } from "react";

function createInitialRows(initialRows) {
  const rows =
    Array.isArray(initialRows) && initialRows.length > 0
      ? initialRows
      : [{ name: "Padrão", quantity: "" }];

  return rows.map((row, index) => ({
    id: `initial-${index}`,
    name: String(row.name ?? ""),
    quantity: String(row.quantity ?? ""),
  }));
}

export function ProductVariationEditor({ initialRows = [] }) {
  const nextRowId = useRef(initialRows.length);
  const [rows, setRows] = useState(() => createInitialRows(initialRows));

  function addRow() {
    nextRowId.current += 1;
    setRows((currentRows) => [
      ...currentRows,
      { id: `added-${nextRowId.current}`, name: "", quantity: "" },
    ]);
  }

  function removeRow(rowId) {
    setRows((currentRows) =>
      currentRows.length > 1
        ? currentRows.filter((row) => row.id !== rowId)
        : currentRows,
    );
  }

  function updateRow(rowId, field, value) {
    setRows((currentRows) =>
      currentRows.map((row) =>
        row.id === rowId ? { ...row, [field]: value } : row,
      ),
    );
  }

  return (
    <section className={cx(globalStyles, "admin-variation-editor span-all")}>
      <div className={cx(globalStyles, "admin-variation-editor-heading")}>
        <div>
          <strong>Variações e estoque</strong>
          <small>
            Cadastre o nome e o saldo da mesma opção na mesma linha.
          </small>
        </div>
        <button
          className={cx(
            globalStyles,
            "button button-secondary admin-variation-add",
          )}
          onClick={addRow}
          type="button"
        >
          Adicionar variação
        </button>
      </div>

      <div className={cx(globalStyles, "admin-variation-list")}>
        {rows.map((row, index) => {
          const displayName = row.name.trim() || String(index + 1);

          return (
            <div
              className={cx(globalStyles, "admin-variation-row")}
              key={row.id}
            >
              <label>
                <span>Variação {index + 1}</span>
                <input
                  aria-label={`Nome da variação ${index + 1}`}
                  autoComplete="off"
                  name="variationName"
                  onChange={(event) =>
                    updateRow(row.id, "name", event.target.value)
                  }
                  placeholder="Ex.: Preto"
                  required
                  value={row.name}
                />
              </label>
              <label>
                <span>Estoque</span>
                <input
                  aria-label={`Estoque da variação ${displayName}`}
                  inputMode="numeric"
                  min="0"
                  name="variationQuantity"
                  onChange={(event) =>
                    updateRow(row.id, "quantity", event.target.value)
                  }
                  placeholder="Sob consulta"
                  step="1"
                  type="number"
                  value={row.quantity}
                />
              </label>
              <button
                aria-label={`Remover variação ${displayName}`}
                className={cx(globalStyles, "admin-variation-remove")}
                disabled={rows.length === 1}
                onClick={() => removeRow(row.id)}
                type="button"
              >
                Remover
              </button>
            </div>
          );
        })}
      </div>

      <small>
        Deixe o estoque vazio para consultar disponibilidade; use 0 quando
        estiver esgotado.
      </small>
    </section>
  );
}
