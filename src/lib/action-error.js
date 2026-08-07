import { logServerEvent } from "./logger.js";

// Erros de driver marcados na origem. O marcador e a defesa primaria: tudo que
// passa por createInternalActionError nunca chega ao usuario com o texto cru.
const internalActionError = Symbol.for("tszr15.action.internalError");

// Rede secundaria, para erros de driver que ainda nao passam pelo marcador.
// Mesma tecnica ja usada em getAdminLoadErrorState.
const databaseMessagePattern =
  /relation .+ does not exist|column .+ does not exist|schema cache|permission denied|duplicate key|violates (?:foreign key|unique|check|not-null)|syntax error at or near|null value in column|invalid input syntax|jwt (?:expired|invalid)|row-level security|PGRST\d+|SQLSTATE|\bat .+:\d+:\d+/i;

const defaultFallbackMessage = "Nao foi possivel concluir a operacao.";

function errorChain(error) {
  const chain = [];
  let current = error;

  while (current && !chain.includes(current) && chain.length < 4) {
    chain.push(current);
    current = current.cause;
  }

  return chain;
}

function hasDatabaseMetadata(entry) {
  return (
    typeof entry?.code === "string" ||
    typeof entry?.hint === "string" ||
    typeof entry?.details === "string"
  );
}

function createReference(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

export function createInternalActionError(error, operation) {
  const wrapped = new Error(defaultFallbackMessage, { cause: error });

  wrapped[internalActionError] = true;
  wrapped.actionOperation = operation;

  return wrapped;
}

export function isInternalActionError(error) {
  return errorChain(error).some(
    (entry) =>
      entry?.[internalActionError] === true ||
      databaseMessagePattern.test(String(entry?.message ?? "")) ||
      hasDatabaseMetadata(entry)
  );
}

// Devolve o texto que pode chegar ao usuario, seja pela URL, pelo estado de uma
// server action ou renderizado direto. Mensagens de validacao escritas pelo
// proprio app passam intactas; qualquer coisa que cheire a driver vira mensagem
// segura + referencia, e o detalhe fica so no log do servidor.
//
// IMPORTANTE: o detalhe vai para o log sob a chave `errorDetail`. O
// redactSensitive do logger censura qualquer chave que case com /message/i —
// logar como `errorMessage` apagaria a evidencia exatamente onde ela precisa
// existir.
export function getSafeActionErrorState(error, options = {}) {
  const {
    event = "action_failed",
    fallbackMessage = defaultFallbackMessage,
    logEvent = logServerEvent,
    prefix = "APP",
    reference: forcedReference
  } = options;

  if (!isInternalActionError(error)) {
    const message = typeof error?.message === "string" ? error.message : "";

    return {
      isInternal: false,
      message: message || fallbackMessage,
      reference: ""
    };
  }

  const chain = errorChain(error);
  const reference = forcedReference ?? createReference(prefix);
  const origin = chain[chain.length - 1];

  logEvent("error", event, {
    errorCode: typeof origin?.code === "string" ? origin.code : "",
    errorDetail: typeof origin?.message === "string" ? origin.message : "",
    errorName: typeof origin?.name === "string" ? origin.name : "",
    operation: error?.actionOperation ?? "desconhecida",
    reference
  });

  return {
    isInternal: true,
    message: `${fallbackMessage} Referencia ${reference}.`,
    reference
  };
}
