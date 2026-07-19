const schemaErrorCodes = new Set(["42P01", "42703", "PGRST200", "PGRST204", "PGRST205"]);
const authorizationErrorCodes = new Set(["42501", "PGRST301", "PGRST302"]);

function errorChain(error) {
  const chain = [];
  let current = error;

  while (current && !chain.includes(current) && chain.length < 4) {
    chain.push(current);
    current = current.cause;
  }

  return chain;
}

function getErrorCode(chain) {
  const value = chain.find((entry) => entry?.code)?.code;
  return String(value ?? "").toUpperCase();
}

function getErrorStatus(chain) {
  const value = chain.find((entry) => Number.isInteger(entry?.status))?.status;
  return Number.isInteger(value) ? value : null;
}

function getCombinedMessage(chain) {
  return chain
    .map((entry) => (typeof entry?.message === "string" ? entry.message : ""))
    .filter(Boolean)
    .join(" ");
}

export function createAdminCatalogLoadError(error) {
  const message =
    typeof error?.message === "string" && error.message
      ? error.message
      : "Falha ao carregar o catalogo administrativo.";
  return new Error(message, { cause: error });
}

export function getAdminLoadErrorState(error) {
  const chain = errorChain(error);
  const code = getErrorCode(chain);
  const status = getErrorStatus(chain);
  const combinedMessage = getCombinedMessage(chain);

  if (
    schemaErrorCodes.has(code) ||
    /relation .+ does not exist|column .+ does not exist|schema cache/i.test(combinedMessage)
  ) {
    return {
      kind: "schema",
      message: "A estrutura de dados do painel esta incompleta ou desatualizada."
    };
  }

  if (
    authorizationErrorCodes.has(code) ||
    status === 401 ||
    status === 403 ||
    /permission denied|unauthorized|forbidden|jwt (?:expired|invalid)/i.test(combinedMessage)
  ) {
    return {
      kind: "authorization",
      message:
        "O Supabase recusou a consulta do painel. Verifique a chave privilegiada e as permissoes do servidor."
    };
  }

  if (
    chain.some((entry) => entry instanceof TypeError) ||
    status === 408 ||
    status === 429 ||
    (Number.isInteger(status) && status >= 500) ||
    /fetch failed|network|econn|timed? ?out|timeout|upstream unavailable/i.test(combinedMessage)
  ) {
    return {
      kind: "connectivity",
      message: "O Supabase esta temporariamente indisponivel. Tente novamente em instantes."
    };
  }

  return {
    kind: "unknown",
    message:
      "Nao foi possivel carregar os dados do painel. Consulte os logs do servidor antes de tentar uma migration."
  };
}
