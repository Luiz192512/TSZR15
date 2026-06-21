"use client";

import { useEffect } from "react";

import { captureClientError } from "@/src/lib/monitoring.js";

export default function GlobalError({ error, reset }) {
  useEffect(() => {
    captureClientError(error, { boundary: "root" });
  }, [error]);

  return (
    <main className="page-shell auth-page">
      <section className="setup-panel" role="alert">
        <p className="section-label">Não foi possível carregar esta página</p>
        <h1>Ocorreu um erro temporário.</h1>
        <p>Tente novamente. Se o problema continuar, volte mais tarde.</p>
        <button className="button" onClick={() => reset()} type="button">
          Tentar novamente
        </button>
      </section>
    </main>
  );
}
