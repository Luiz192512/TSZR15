export const brasiliaTimeZone = "America/Sao_Paulo";

function toValidDate(value) {
  const date = value instanceof Date ? value : new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
}

export function getBrasiliaDateKey(value) {
  const date = toValidDate(value);

  if (!date) {
    return "";
  }

  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone: brasiliaTimeZone,
    year: "numeric"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return `${values.year}-${values.month}-${values.day}`;
}

export function formatBrasiliaDate(value, options) {
  const date = toValidDate(value);

  if (!date) {
    return "";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    ...options,
    timeZone: brasiliaTimeZone
  }).format(date);
}

export function formatBrasiliaDateTime(value) {
  return formatBrasiliaDate(value, {
    dateStyle: "short",
    timeStyle: "short"
  });
}
