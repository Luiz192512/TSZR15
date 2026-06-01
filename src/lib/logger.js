import pino from "pino";

const censor = "[redacted]";
const sensitiveKeyPattern =
  /authorization|cookie|token|password|email|phone|whatsapp|tax|cpf|cnpj|customer|payload|message|url/i;

const redactPaths = [
  "authorization",
  "cookie",
  "headers.authorization",
  "headers.cookie",
  "req.headers.authorization",
  "req.headers.cookie",
  "token",
  "password",
  "email",
  "phone",
  "phoneNumber",
  "whatsapp",
  "whatsappUrl",
  "taxId",
  "tax_id",
  "cpf",
  "cnpj",
  "customer",
  "payload",
  "payload.customer",
  "*.authorization",
  "*.cookie",
  "*.token",
  "*.password",
  "*.email",
  "*.phone",
  "*.phoneNumber",
  "*.whatsapp",
  "*.whatsappUrl",
  "*.taxId",
  "*.tax_id",
  "*.cpf",
  "*.cnpj",
  "*.customer",
  "*.payload"
];

function createBaseLogger() {
  return pino({
    base: undefined,
    level: process.env.LOG_LEVEL ?? "info",
    redact: {
      censor,
      paths: redactPaths,
      remove: false
    }
  });
}

export const logger = createBaseLogger();

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
      sensitiveKeyPattern.test(key) ? censor : redactSensitive(entryValue)
    ])
  );
}

export function logServerEvent(level, event, details = {}) {
  const logMethod =
    typeof logger[level] === "function" ? logger[level].bind(logger) : logger.info.bind(logger);

  logMethod(redactSensitive({ event, ...details }), event);
}
