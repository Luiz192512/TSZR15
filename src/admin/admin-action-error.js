import { logServerEvent } from "../lib/logger.js";

// Erros de driver marcados na origem. O marcador e a defesa primaria: tudo que
// passa por createAdminDatabaseError nunca chega ao usuario com o texto cru.
const internalAdminError = Symbol.for("tszr15.admin.internalError");

// Rede secundaria, para erros de driver que ainda nao passam pelo marcador
// (ex.: modulos compartilhados com o fluxo do cliente). Mesma tecnica ja usada
// em getAdminLoadErrorState.
const databaseMessagePattern =
  /relation .+ does not exist|column .+ does not exist|schema cache|permission denied|duplicate key|violates (?:foreign key|unique|check|not-null)|syntax error at or near|null value in column|invalid input syntax|jwt (?:expired|invalid)|row-level security|PGRST\d+|SQLSTATE|\bat .+:\d+:\d+/i;

const genericAdminErrorMessage = "Nao foi possivel concluir a operacao no painel.";

function errorChain(error) {
  const chain = [];
  let current = error;

  while (current && !chain.includes(current) && chain.length < 4) {
    chain.push(current);
    current = current.cause;
  }

  return chain;
}

function hasDatabaseMetadata(chain) {
  return chain.some(
    (entry) =>
      typeof entry?.code === "string" ||
      typeof entry?.hint === "string" ||
      typeof entry?.details === "string"
  );
}

function createReference() {
  return `ADM-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

export function createAdminDatabaseError(error, operation) {
  const wrapped = new Error(genericAdminErrorMessage, { cause: error });

  wrapped[internalAdminError] = true;
  wrapped.adminOperation = operation;

  return wrapped;
}

export function isInternalAdminError(error) {
  const chain = errorChain(error);

  return chain.some(
    (entry) =>
      entry?.[internalAdminError] === true ||
      databaseMessagePattern.test(String(entry?.message ?? "")) ||
      hasDatabaseMetadata(entry ? [entry] : [])
  );
}

// Devolve o texto que pode ir para a URL. Mensagens de validacao escritas pelo
// proprio painel passam intactas; qualquer coisa que cheire a driver vira
// mensagem generica + referencia, e o detalhe fica so no log do servidor.
export function getAdminActionErrorState(error, options = {}) {
  const { logEvent = logServerEvent, reference: forcedReference } = options;

  if (!isInternalAdminError(error)) {
    const message = typeof error?.message === "string" ? error.message : "";

    return {
      isInternal: false,
      message: message || genericAdminErrorMessage,
      reference: ""
    };
  }

  const chain = errorChain(error);
  const reference = forcedReference ?? createReference();
  const origin = chain[chain.length - 1];

  logEvent("error", "admin_action_failed", {
    errorCode: typeof origin?.code === "string" ? origin.code : "",
    errorDetail: typeof origin?.message === "string" ? origin.message : "",
    errorName: typeof origin?.name === "string" ? origin.name : "",
    operation: error?.adminOperation ?? "desconhecida",
    reference
  });

  return {
    isInternal: true,
    message: `${genericAdminErrorMessage} Referencia ${reference}.`,
    reference
  };
}
