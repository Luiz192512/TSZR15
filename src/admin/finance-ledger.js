/**
 * Leitura do ledger para o painel. Sem `server-only` de proposito: e regra pura
 * de apresentacao, e precisa rodar tambem no teste.
 */

/**
 * Margem que o painel exibe: a reconciliada quando o custo real ja foi
 * registrado, a provisoria enquanto ele nao existe.
 *
 * Margem negativa NAO e escondida nem zerada — prejuizo e exatamente o caso que
 * o dono precisa ver antes de repassar qualquer coisa.
 */
export function resolveDisplayMarginCents(ledger) {
  return Number.isInteger(ledger.reconciled_margin_cents)
    ? ledger.reconciled_margin_cents
    : (ledger.provisional_margin_cents ?? 0);
}

export function summarizeLedgers(ledgers = []) {
  const pendentes = ledgers.filter((ledger) => ledger.payout_status === "pendente");

  return {
    negativos: ledgers.filter((ledger) => resolveDisplayMarginCents(ledger) < 0).length,
    pendenteCount: pendentes.length,
    pendenteTotalCents: pendentes.reduce(
      (total, ledger) => total + resolveDisplayMarginCents(ledger),
      0
    ),
    reconciliadosCount: ledgers.filter((ledger) => ledger.reconciled_at).length,
    repassadoTotalCents: ledgers
      .filter((ledger) => ledger.payout_status === "repassado")
      .reduce((total, ledger) => total + (ledger.payout_amount_cents ?? 0), 0)
  };
}
