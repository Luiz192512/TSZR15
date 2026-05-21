const onlyDigitsPattern = /\D/g;

export const taxIdPattern =
  "(?:\\d{3}\\.?\\d{3}\\.?\\d{3}-?\\d{2})|(?:\\d{2}\\.?\\d{3}\\.?\\d{3}\\/?\\d{4}-?\\d{2})";
export const phonePattern = "(?=(?:.*[0-9]){10,13})\\+?[0-9 \\(\\).\\-]{10,20}";
export const cepPattern = "\\d{5}-?\\d{3}";
export const statePattern = "[A-Za-z]{2}";

export function digitsOnly(value) {
  return String(value ?? "").replace(onlyDigitsPattern, "");
}

export function sanitizeTaxId(value) {
  return String(value ?? "").replace(/[^0-9./-]/g, "").slice(0, 18);
}

export function sanitizePhone(value) {
  return String(value ?? "").replace(/[^0-9+()\s.-]/g, "").slice(0, 20);
}

export function sanitizeCep(value) {
  return String(value ?? "").replace(/[^0-9-]/g, "").slice(0, 9);
}

export function sanitizeState(value) {
  return String(value ?? "").replace(/[^a-z]/gi, "").slice(0, 2).toUpperCase();
}

export function isValidTaxId(value) {
  const trimmed = String(value ?? "").trim();

  if (!trimmed) {
    return true;
  }

  if (sanitizeTaxId(trimmed) !== trimmed) {
    return false;
  }

  const digits = digitsOnly(trimmed);
  return digits.length === 11 || digits.length === 14;
}

export function isValidPhone(value, { required = false } = {}) {
  const trimmed = String(value ?? "").trim();

  if (!trimmed) {
    return !required;
  }

  if (sanitizePhone(trimmed) !== trimmed) {
    return false;
  }

  const digits = digitsOnly(trimmed);
  return digits.length >= 10 && digits.length <= 13;
}

export function isValidCep(value) {
  const trimmed = String(value ?? "").trim();

  if (sanitizeCep(trimmed) !== trimmed) {
    return false;
  }

  return digitsOnly(trimmed).length === 8;
}

export function isValidState(value) {
  return /^[A-Za-z]{2}$/.test(String(value ?? "").trim());
}

export function validateCustomerFieldFormats({ taxId, whatsapp, phone, cep, state }) {
  const errors = [];

  if (!isValidTaxId(taxId)) {
    errors.push("CPF/CNPJ deve conter apenas numeros e pontuacao valida.");
  }

  if (!isValidPhone(whatsapp)) {
    errors.push("WhatsApp deve conter apenas numeros e pontuacao valida.");
  }

  if (!isValidPhone(phone)) {
    errors.push("Telefone deve conter apenas numeros e pontuacao valida.");
  }

  if (cep !== undefined && !isValidCep(cep)) {
    errors.push("CEP deve conter 8 numeros.");
  }

  if (state !== undefined && !isValidState(state)) {
    errors.push("UF deve conter apenas 2 letras.");
  }

  return errors;
}
