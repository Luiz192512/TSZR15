function digitsOnly(value) {
  return String(value ?? "")
    .trim()
    .slice(0, 120)
    .replace(/\D/g, "");
}

function canonicalPhone(value) {
  const digits = digitsOnly(value);

  if (digits.length === 10 || digits.length === 11) {
    return `55${digits}`;
  }

  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) {
    return digits;
  }

  return "";
}

function canonicalTaxId(value) {
  const digits = digitsOnly(value);

  return digits.length === 11 || digits.length === 14 ? digits : "";
}

export function contactMatchesOrder(order, contact) {
  const submittedPhone = canonicalPhone(contact);
  const submittedTaxId = canonicalTaxId(contact);

  if (!submittedPhone && !submittedTaxId) {
    return false;
  }

  const phoneValues = [
    order?.customer_whatsapp,
    order?.customer_phone,
    order?.customer_snapshot?.whatsapp,
    order?.customer_snapshot?.phone
  ];
  const taxIdValues = [order?.customer_tax_id, order?.customer_snapshot?.taxId];

  return (
    (submittedPhone && phoneValues.some((value) => canonicalPhone(value) === submittedPhone)) ||
    (submittedTaxId && taxIdValues.some((value) => canonicalTaxId(value) === submittedTaxId))
  );
}
