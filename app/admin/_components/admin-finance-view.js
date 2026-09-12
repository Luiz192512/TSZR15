import globalStyles from "@/app/storefront.module.css";
import { cx } from "@/src/lib/classnames";

import { markLedgerPayoutAction, reconcileLedgerAction } from "@/app/admin/actions.js";
import { formatCurrency } from "@/app/admin/_components/admin-ui.js";
import { formatAdminDisplayDateTime as formatDateTime } from "@/src/admin/admin-form-values.js";
import { resolveDisplayMarginCents } from "@/src/admin/finance-ledger.js";

const PAYOUT_LABELS = {
  estornado: "Estornado",
  nao_aplicavel: "Nao aplicavel",
  pendente: "Pendente",
  repassado: "Repassado"
};

function MetricCard({ detail, label, tone = "", value }) {
  return (
    <div className={cx(globalStyles, `admin-metric-card ${tone ? `is-${tone}` : ""}`)}>
      <span>{label}</span>
      <strong>{value}</strong>
      {detail ? <small>{detail}</small> : null}
    </div>
  );
}

function LedgerCard({ ledger }) {
  const margem = resolveDisplayMarginCents(ledger);
  const reconciliado = Boolean(ledger.reconciled_at);
  const recebido = ledger.settled_amount_cents ?? null;
  const podeRepassar = ledger.payout_status !== "repassado";

  return (
    <article className={cx(globalStyles, "admin-detail-panel")}>
      <header className={cx(globalStyles, "admin-panel-heading")}>
        <div>
          <strong>Pedido {ledger.order?.order_number || "sem numero"}</strong>
          <span>{ledger.order?.customer_name || "Cliente sem nome"}</span>
        </div>
        <span className={cx(globalStyles, "badge")}>
          {PAYOUT_LABELS[ledger.payout_status] ?? ledger.payout_status}
        </span>
      </header>

      <dl className={cx(globalStyles, "admin-definition-list")}>
        <div>
          <dt>Cobrado</dt>
          <dd>{formatCurrency(ledger.charged_amount_cents ?? 0)}</dd>
        </div>
        <div>
          <dt>Recebido liquido</dt>
          <dd>{recebido === null ? "aguardando o provedor" : formatCurrency(recebido)}</dd>
        </div>
        <div>
          <dt>Taxa do provedor</dt>
          <dd>{formatCurrency(ledger.provider_fee_cents ?? 0)}</dd>
        </div>
        {ledger.refunded_amount_cents > 0 ? (
          <div>
            <dt>Estornado</dt>
            <dd>{formatCurrency(ledger.refunded_amount_cents)}</dd>
          </div>
        ) : null}
        <div>
          <dt>Custo estimado</dt>
          <dd>{formatCurrency(ledger.estimated_cost_cents ?? 0)}</dd>
        </div>
        <div>
          <dt>Custo real</dt>
          <dd>
            {Number.isInteger(ledger.actual_cost_cents)
              ? formatCurrency(ledger.actual_cost_cents)
              : "compra ainda nao registrada"}
          </dd>
        </div>
      </dl>

      <div className={cx(globalStyles, "admin-total-box")}>
        <span>{reconciliado ? "Margem reconciliada" : "Margem provisoria"}</span>
        <strong>{formatCurrency(margem)}</strong>
      </div>

      {margem < 0 ? (
        <p className={cx(globalStyles, "helper-text")}>
          Margem negativa: este pedido deu prejuizo. Conferir custo e taxa antes de repassar
          qualquer valor.
        </p>
      ) : null}

      {ledger.notes ? <p className={cx(globalStyles, "helper-text")}>{ledger.notes}</p> : null}

      {ledger.payout_status === "repassado" ? (
        <p className={cx(globalStyles, "helper-text")}>
          Repassado {formatCurrency(ledger.payout_amount_cents ?? 0)} em{" "}
          {formatDateTime(ledger.payout_at)} por {ledger.payout_approved_by}. Referencia:{" "}
          {ledger.payout_reference}.
        </p>
      ) : null}

      {podeRepassar ? (
        <form action={markLedgerPayoutAction} className={cx(globalStyles, "form-grid")}>
          <input name="ledgerId" type="hidden" value={ledger.id} />
          <input name="payoutStatus" type="hidden" value="repassado" />

          <label>
            <span>Valor transferido</span>
            <input
              defaultValue={margem > 0 ? (margem / 100).toFixed(2) : ""}
              inputMode="decimal"
              name="payoutAmount"
              placeholder="0,00"
              required
            />
          </label>
          <label>
            <span>Data da transferencia</span>
            <input name="payoutAt" required type="datetime-local" />
          </label>
          <label>
            <span>Quem aprovou</span>
            <input name="payoutApprovedBy" placeholder="Nome de quem transferiu" required />
          </label>
          <label>
            <span>Referencia</span>
            <input name="payoutReference" placeholder="Pix, TED ou comprovante" required />
          </label>

          <p className={cx(globalStyles, "form-hint span-all")}>
            Preencha depois de fazer a transferencia. Isto registra o repasse, nao executa nenhum.
          </p>

          <button className={cx(globalStyles, "button button-primary span-all")} type="submit">
            Registrar repasse
          </button>
        </form>
      ) : (
        <form action={markLedgerPayoutAction}>
          <input name="ledgerId" type="hidden" value={ledger.id} />
          <input name="payoutStatus" type="hidden" value="pendente" />
          <button className={cx(globalStyles, "button")} type="submit">
            Desfazer repasse
          </button>
        </form>
      )}

      <form action={reconcileLedgerAction}>
        <input name="orderId" type="hidden" value={ledger.order_id} />
        <button className={cx(globalStyles, "button")} type="submit">
          Recalcular a partir das fontes
        </button>
      </form>
    </article>
  );
}

export function AdminFinance({ ledgers = [], summary }) {
  return (
    <section className={cx(globalStyles, "admin-analytics-shell")}>
      <div className={cx(globalStyles, "admin-metric-grid")}>
        <MetricCard
          detail={`${summary.pendenteCount} pedido(s) aguardando`}
          label="A repassar"
          tone={summary.pendenteTotalCents >= 0 ? "positive" : "negative"}
          value={formatCurrency(summary.pendenteTotalCents)}
        />
        <MetricCard
          detail="registrado por uma pessoa"
          label="Ja repassado"
          value={formatCurrency(summary.repassadoTotalCents)}
        />
        <MetricCard
          detail="com custo real registrado"
          label="Reconciliados"
          value={String(summary.reconciliadosCount)}
        />
        <MetricCard
          detail={summary.negativos > 0 ? "conferir antes de repassar" : "nenhum prejuizo"}
          label="Margem negativa"
          tone={summary.negativos > 0 ? "negative" : "positive"}
          value={String(summary.negativos)}
        />
      </div>

      <section className={cx(globalStyles, "admin-section")}>
        <h2>Repasse para a conta da empresa</h2>
        <p className={cx(globalStyles, "helper-text")}>
          O sistema calcula quanto sobra e guarda a obrigacao. Quem move o dinheiro e uma pessoa —
          aqui fica so o registro de que a transferencia aconteceu.
        </p>

        {ledgers.length === 0 ? (
          <p className={cx(globalStyles, "helper-text")}>
            Nenhum pagamento online liquidado ainda. Pedido fechado pelo WhatsApp nao gera
            lancamento aqui.
          </p>
        ) : (
          <div className={cx(globalStyles, "admin-content-grid")}>
            {ledgers.map((ledger) => (
              <LedgerCard key={ledger.id} ledger={ledger} />
            ))}
          </div>
        )}
      </section>
    </section>
  );
}
