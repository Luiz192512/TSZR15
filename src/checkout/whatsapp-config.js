export function getConfiguredWhatsAppNumber(environment = process.env) {
  const value =
    environment.WHATSAPP_BUSINESS_NUMBER ??
    environment.NEXT_PUBLIC_WHATSAPP_BUSINESS_NUMBER ??
    "";
  const digits = String(value).replace(/\D/g, "");

  return digits.length >= 10 && digits.length <= 15 ? digits : "";
}
