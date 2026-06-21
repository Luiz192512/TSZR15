"use client";

import { useEffect } from "react";

import { captureClientError } from "@/src/lib/monitoring.js";

export function RouteError({ error, reset }) {
  useEffect(() => {
    captureClientError(error, { boundary: "route" });
  }, [error]);

  return (
    <main className="page-shell auth-page">
      <section className="setup-panel" role="alert">
        <p className="section-label">Conteúdo indisponível</p>
        <h1>Não foi possível concluir o carregamento.</h1>
        <p>Verifique sua conexão e tente novamente.</p>
        <button className="button" onClick={reset} type="button">
          Tentar novamente
        </button>
      </section>
    </main>
  );
}
