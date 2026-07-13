const censor = "[redacted]";
const sensitiveKeyPattern =
  /authorization|cookie|token|password|email|phone|whatsapp|tax|cpf|cnpj|customer|payload|message|url/i;

const logLevels = Object.freeze({
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
});

const consoleMethods = Object.freeze({
  trace: "debug",
  debug: "debug",
  info: "info",
  warn: "warn",
  error: "error",
  fatal: "error",
});

export function redactSensitive(value) {
  if (Array.isArray(value)) {
    return value.map((item) => redactSensitive(item));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entryValue]) => [
      key,
      sensitiveKeyPattern.test(key) ? censor : redactSensitive(entryValue),
    ]),
  );
}

function shouldLog(level) {
  const configuredLevel = Object.hasOwn(logLevels, process.env.LOG_LEVEL)
    ? process.env.LOG_LEVEL
    : "info";

  return logLevels[level] >= logLevels[configuredLevel];
}

function normalizeLogArguments(input, message) {
  if (typeof input === "string" && message === undefined) {
    return { details: {}, message: input };
  }

  if (input instanceof Error) {
    return {
      details: {
        err: {
          message: input.message,
          name: input.name,
          stack: input.stack,
        },
      },
      message,
    };
  }

  return {
    details: input && typeof input === "object" ? input : {},
    message,
  };
}

function writeLog(level, input, message) {
  if (!shouldLog(level)) {
    return;
  }

  const normalized = normalizeLogArguments(input, message);
  const entry = {
    ...redactSensitive(normalized.details),
    level,
    time: new Date().toISOString(),
    ...(normalized.message ? { msg: normalized.message } : {}),
  };
  const method = consoleMethods[level] ?? "info";

  console[method](JSON.stringify(entry));
}

export const logger = Object.freeze(
  Object.fromEntries(
    Object.keys(logLevels).map((level) => [
      level,
      (input, message) => writeLog(level, input, message),
    ]),
  ),
);

export function logServerEvent(level, event, details = {}) {
  const logMethod =
    typeof logger[level] === "function"
      ? logger[level].bind(logger)
      : logger.info.bind(logger);

  logMethod(redactSensitive({ event, ...details }), event);
}
