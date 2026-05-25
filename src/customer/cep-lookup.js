import { digitsOnly, sanitizeCep, sanitizeState } from "./field-validation.js";

const viaCepBaseUrl = "https://viacep.com.br/ws";

function cleanText(value) {
  return String(value ?? "").trim();
}

export function getCepDigits(value) {
  return digitsOnly(value).slice(0, 8);
}

export function canLookupCep(value) {
  return getCepDigits(value).length === 8;
}

export function buildViaCepLookupUrl(value) {
  const cepDigits = getCepDigits(value);

  if (cepDigits.length !== 8) {
    return "";
  }

  return `${viaCepBaseUrl}/${cepDigits}/json/`;
}

export function normalizeViaCepAddress(data) {
  if (!data || data.erro) {
    return null;
  }

  const state = sanitizeState(data.uf);

  return {
    cep: sanitizeCep(data.cep),
    city: cleanText(data.localidade),
    district: cleanText(data.bairro),
    state,
    street: cleanText(data.logradouro)
  };
}

export function formatCepAddressLine(address) {
  if (!address) {
    return "";
  }

  const cityLine = [address.city, address.state].filter(Boolean).join("/");

  return [address.street, address.district, cityLine].filter(Boolean).join(" - ");
}

export async function fetchCepAddress(value, { signal } = {}) {
  const lookupUrl = buildViaCepLookupUrl(value);

  if (!lookupUrl) {
    return null;
  }

  const response = await fetch(lookupUrl, { signal });

  if (!response.ok) {
    throw new Error("Nao foi possivel consultar o CEP agora.");
  }

  return normalizeViaCepAddress(await response.json());
}
