"use client";

import globalStyles from "@/src/styles/storefront-styles.js";
import { cx } from "@/src/lib/classnames";
import { useEffect } from "react";

import { captureClientError } from "@/src/lib/monitoring.js";

export function RouteError({ error, reset }) {
  useEffect(() => {
    captureClientError(error, { boundary: "route" });
  }, [error]);

  return (
    <main className={cx(globalStyles, "page-shell auth-page")}>
      <section className={cx(globalStyles, "setup-panel")} role="alert">
        <p className={cx(globalStyles, "section-label")}>Conteúdo indisponível</p>
        <h1>Não foi possível concluir o carregamento.</h1>
        <p>Verifique sua conexão e tente novamente.</p>
        <button className={cx(globalStyles, "button")} onClick={reset} type="button">
          Tentar novamente
        </button>
      </section>
    </main>
  );
}
