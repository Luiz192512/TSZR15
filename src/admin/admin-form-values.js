export const ADMIN_TIME_ZONE = "America/Sao_Paulo";

export function formatAdminDisplayDateTime(
  value,
  { timeZone = ADMIN_TIME_ZONE } = {},
) {
  if (!value) {
    return "Nao informado";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Nao informado";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone,
  }).format(date);
}

function getDateTimeParts(date, timeZone) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    hourCycle: "h23",
    minute: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  });
  const parts = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );

  return {
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    month: Number(parts.month),
    year: Number(parts.year),
  };
}

function getTimeZoneOffsetMs(date, timeZone) {
  const parts = getDateTimeParts(date, timeZone);
  return (
    Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute) -
    date.getTime()
  );
}

function padDatePart(value) {
  return String(value).padStart(2, "0");
}

export function formatAdminDateTimeInput(
  value,
  { timeZone = ADMIN_TIME_ZONE } = {},
) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const parts = getDateTimeParts(date, timeZone);
  return `${parts.year}-${padDatePart(parts.month)}-${padDatePart(parts.day)}T${padDatePart(parts.hour)}:${padDatePart(parts.minute)}`;
}

export function parseAdminDateTimeInput(
  value,
  { timeZone = ADMIN_TIME_ZONE } = {},
) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(
    String(value ?? "").trim(),
  );

  if (!match) {
    return null;
  }

  const [, yearText, monthText, dayText, hourText, minuteText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const wallClockUtc = Date.UTC(year, month - 1, day, hour, minute);
  const wallClockDate = new Date(wallClockUtc);

  if (
    wallClockDate.getUTCFullYear() !== year ||
    wallClockDate.getUTCMonth() !== month - 1 ||
    wallClockDate.getUTCDate() !== day ||
    hour > 23 ||
    minute > 59
  ) {
    return null;
  }

  let instantMs = wallClockUtc - getTimeZoneOffsetMs(wallClockDate, timeZone);
  instantMs = wallClockUtc - getTimeZoneOffsetMs(new Date(instantMs), timeZone);
  const instant = new Date(instantMs);
  const normalizedInput = `${yearText}-${monthText}-${dayText}T${hourText}:${minuteText}`;

  return formatAdminDateTimeInput(instant, { timeZone }) === normalizedInput
    ? instant.toISOString()
    : null;
}

function normalizeGroupedInteger(value, separator) {
  if (!separator) {
    return /^\d+$/.test(value) ? value : "";
  }

  const escapedSeparator = separator === "." ? "\\." : separator;
  const groupedPattern = new RegExp(`^\\d{1,3}(?:${escapedSeparator}\\d{3})+$`);
  return groupedPattern.test(value) ? value.split(separator).join("") : "";
}

function normalizeMoneyValue(value) {
  const text = String(value ?? "")
    .trim()
    .replace(/\s+/g, "");

  if (!text || !/^\d+(?:[.,]\d+)*$/.test(text)) {
    return "";
  }

  const commaIndex = text.lastIndexOf(",");
  const dotIndex = text.lastIndexOf(".");

  if (commaIndex >= 0 && dotIndex >= 0) {
    const decimalSeparator = commaIndex > dotIndex ? "," : ".";
    const groupingSeparator = decimalSeparator === "," ? "." : ",";
    const decimalIndex = Math.max(commaIndex, dotIndex);
    const integerPart = normalizeGroupedInteger(
      text.slice(0, decimalIndex),
      groupingSeparator,
    );
    const fractionalPart = text.slice(decimalIndex + 1);

    return integerPart && /^\d{1,2}$/.test(fractionalPart)
      ? `${integerPart}.${fractionalPart}`
      : "";
  }

  const separator = commaIndex >= 0 ? "," : dotIndex >= 0 ? "." : "";

  if (!separator) {
    return text;
  }

  const parts = text.split(separator);

  if (parts.length === 2 && /^\d{1,2}$/.test(parts[1])) {
    return `${parts[0]}.${parts[1]}`;
  }

  return normalizeGroupedInteger(text, separator);
}

export function parseAdminMoneyToCents(value, { allowZero = false } = {}) {
  const normalized = normalizeMoneyValue(value);

  if (!normalized) {
    return null;
  }

  const cents = Math.round(Number(normalized) * 100);

  if (
    !Number.isSafeInteger(cents) ||
    cents < 0 ||
    (!allowZero && cents === 0)
  ) {
    return null;
  }

  return cents;
}
