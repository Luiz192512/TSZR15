"use client";

import dynamic from "next/dynamic";
import { startTransition, useState } from "react";

const R15Scene = dynamic(
  () => import("@/src/components/configurator/r15-scene.js").then((module) => module.R15Scene),
  {
    ssr: false,
    loading: () => <div className="viewer-frame" />
  }
);

function buildInitialSelection(slotGroups) {
  return Object.fromEntries(
    slotGroups
      .filter((group) => group.products.length > 0)
      .map((group) => [group.slot, group.products[0].id])
  );
}

export function ConfiguratorWorkbench({ slotGroups }) {
  const [selectedSlot, setSelectedSlot] = useState(slotGroups[0]?.slot ?? null);
  const [selectedProducts, setSelectedProducts] = useState(() => buildInitialSelection(slotGroups));

  const enrichedGroups = slotGroups.map((group) => ({
    ...group,
    selectedProduct:
      group.products.find((product) => product.id === selectedProducts[group.slot]) ?? null
  }));

  const currentSelection = enrichedGroups.find((group) => group.slot === selectedSlot) ?? enrichedGroups[0];

  return (
    <section className="workbench-layout">
      <div className="configurator-panel">
        <div className="section-heading">
          <div>
            <p className="section-label">Viewer</p>
            <h2>Moto base com acessorios em 360</h2>
          </div>
          <p className="helper-text">
            Orbit livre com destaque visual por slot e selecao em tempo real.
          </p>
        </div>

        <div className="viewer-frame">
          <R15Scene slotGroups={enrichedGroups} />
          <div className="viewer-overlay">
            <span className="overlay-chip">Arraste para orbitar</span>
            <span className="overlay-chip">Scroll ou pinch para zoom</span>
            <span className="overlay-chip">
              {Object.values(selectedProducts).filter(Boolean).length} slots ativos
            </span>
          </div>
        </div>
      </div>

      <aside className="configurator-panel">
        <div className="section-heading">
          <div>
            <p className="section-label">Slots</p>
            <h2>Selecao inicial</h2>
          </div>
          <p className="helper-text">Escolha um slot e troque a peca renderizada.</p>
        </div>

        <div className="slot-grid">
          {enrichedGroups.map((group) => (
            <article
              className={`slot-card ${selectedSlot === group.slot ? "is-active" : ""}`}
              key={group.slot}
            >
              <span className="slot-tag">{group.products.length} opcoes</span>
              <h3>{group.slot}</h3>
              <p className="helper-text">
                Selecionado: {group.selectedProduct?.name ?? "nenhum item"}
              </p>
              <div className="slot-actions">
                <button
                  className={`slot-button ${selectedSlot === group.slot ? "is-active" : ""}`}
                  onClick={() => startTransition(() => setSelectedSlot(group.slot))}
                  type="button"
                >
                  Editar slot
                </button>
              </div>
            </article>
          ))}
        </div>

        {currentSelection ? (
          <>
            <div className="selected-summary">
              <h3>{currentSelection.slot}</h3>
              <div className="summary-list">
                <div className="summary-item">
                  <strong>Produto atual</strong>
                  <span>{currentSelection.selectedProduct?.name ?? "nenhum item"}</span>
                </div>
                <div className="summary-item">
                  <strong>Familia tecnica</strong>
                  <span>{currentSelection.selectedProduct?.productFamily ?? "sem familia"}</span>
                </div>
                <div className="summary-item">
                  <strong>Compatibilidade</strong>
                  <span>Exclusivo por slot no MVP</span>
                </div>
              </div>
            </div>

            <div className="selection-list">
              {currentSelection.products.map((product) => (
                <button
                  className={`pill-button ${
                    currentSelection.selectedProduct?.id === product.id ? "is-active" : ""
                  }`}
                  key={product.id}
                  onClick={() =>
                    startTransition(() =>
                      setSelectedProducts((previous) => ({
                        ...previous,
                        [currentSelection.slot]: product.id
                      }))
                    )
                  }
                  type="button"
                >
                  {product.name}
                </button>
              ))}
            </div>
          </>
        ) : null}
      </aside>
    </section>
  );
}
