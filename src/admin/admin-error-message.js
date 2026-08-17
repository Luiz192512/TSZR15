const fallbackMessage = "Nao foi possivel concluir a operacao. Tente novamente.";
const maxMessageLength = 200;

// Texto que so aparece em erro de banco, PostgREST ou runtime. A aplicacao
// escreve as proprias mensagens em portugues, entao qualquer coisa com essas
// marcas veio de baixo e nao deve ir para a URL do painel.
const technicalPatterns = [
  /\b\d{5}\b:/,
  /duplicate key/i,
  /violates .*constraint/i,
  /violates row-level security/i,
  /relation "/i,
  /\bcolumn\b/i,
  /permission denied/i,
  /schema cache/i,
  /syntax error/i,
  /does not exist/i,
  /\bPGRST\d+\b/,
  /\bat .*\(.*:\d+:\d+\)/
];

export function toAdminErrorMessage(error) {
  if (!(error instanceof Error)) {
    return fallbackMessage;
  }

  const message = String(error.message ?? "").trim();

  if (!message || message.length > maxMessageLength) {
    return fallbackMessage;
  }

  if (technicalPatterns.some((pattern) => pattern.test(message))) {
    return fallbackMessage;
  }

  return message;
}
