export const MIN_CUSTOMER_PASSWORD_LENGTH = 8;
export const CUSTOMER_PASSWORD_PATTERN = "(?=.*[a-z])(?=.*[A-Z])(?=.*\\d).{8,}";
export const CUSTOMER_PASSWORD_REQUIREMENTS_MESSAGE =
  "Use pelo menos 8 caracteres, com uma letra minuscula, uma maiuscula e um numero.";

export function getCustomerPasswordError(password) {
  const value = String(password ?? "");

  if (value.length < MIN_CUSTOMER_PASSWORD_LENGTH) {
    return `Use uma senha com pelo menos ${MIN_CUSTOMER_PASSWORD_LENGTH} caracteres.`;
  }

  if (!/[a-z]/.test(value) || !/[A-Z]/.test(value) || !/\d/.test(value)) {
    return "Use pelo menos uma letra minuscula, uma maiuscula e um numero.";
  }

  return "";
}
