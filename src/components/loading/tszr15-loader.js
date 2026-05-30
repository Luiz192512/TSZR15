export function Tszr15Loader({ label = "Carregando TSZR15" }) {
  return (
    <section className="tszr-loader-shell" role="status" aria-live="polite">
      <div className="tszr-loader-card">
        <div className="tszr-loader-mark" aria-hidden="true">
          <span />
          <i />
        </div>
        <div>
          <strong>{label}</strong>
          <p>Preparando dados, pedidos e catalogo.</p>
        </div>
        <div className="tszr-loader-bars" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </div>
    </section>
  );
}
