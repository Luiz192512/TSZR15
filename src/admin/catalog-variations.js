const canonicalVariationNames = new Map([
  ["aluminio", "Alumínio"],
  ["fume", "Fumê"],
  ["holografico", "Holográfico"],
  ["padrao", "Padrão"],
]);

function cleanVariationName(value) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 120);
}

function normalizeVariationName(value) {
  return cleanVariationName(value)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function canonicalizeVariationName(value) {
  const cleaned = cleanVariationName(value);
  return (
    canonicalVariationNames.get(normalizeVariationName(cleaned)) ?? cleaned
  );
}

function parseVariationQuantity(value, variation) {
  const quantityText = String(value ?? "").trim();

  if (!quantityText) {
    return null;
  }

  if (!/^\d+$/.test(quantityText)) {
    throw new Error(`Estoque inválido para a variação ${variation}.`);
  }

  const quantity = Number(quantityText);

  if (!Number.isSafeInteger(quantity) || quantity < 0) {
    throw new Error(`Estoque inválido para a variação ${variation}.`);
  }

  return quantity;
}

export function collectAdminVariationInventory(formData) {
  const lines = String(formData.get("variationInventory") ?? "")
    .split(/\r?\n/)
    .slice(0, 24);
  const seenNames = new Set();
  const stock = [];

  for (const line of lines) {
    const separatorIndex = line.indexOf("=");
    const rawName = cleanVariationName(
      separatorIndex >= 0 ? line.slice(0, separatorIndex) : line,
    );
    const rawQuantity =
      separatorIndex >= 0 ? line.slice(separatorIndex + 1) : "";

    if (!rawName && !String(rawQuantity).trim()) {
      continue;
    }

    if (!rawName) {
      throw new Error(
        "Informe o nome de cada variação com estoque preenchido.",
      );
    }

    const variation = canonicalizeVariationName(rawName);
    const normalizedName = normalizeVariationName(variation);

    if (seenNames.has(normalizedName)) {
      throw new Error(`A variação ${variation} foi informada mais de uma vez.`);
    }

    seenNames.add(normalizedName);
    stock.push({
      quantity: parseVariationQuantity(rawQuantity, variation),
      variation,
    });
  }

  if (stock.length === 0) {
    throw new Error("Informe pelo menos uma variação.");
  }

  return {
    stock,
    variations: stock.map((entry) => entry.variation),
  };
}

export function formatAdminVariationInventory(
  variations = [],
  variationStock = [],
) {
  const stockByVariation = new Map(
    variationStock.map((entry) => [
      normalizeVariationName(entry.variation),
      entry.quantity,
    ]),
  );
  const seenNames = new Set();
  const lines = [];

  for (const value of variations) {
    const name = canonicalizeVariationName(value);
    const normalizedName = normalizeVariationName(name);

    if (!name || seenNames.has(normalizedName)) {
      continue;
    }

    seenNames.add(normalizedName);
    const quantity = stockByVariation.get(normalizedName);
    const quantityText =
      Number.isSafeInteger(quantity) && quantity >= 0 ? String(quantity) : "";
    lines.push(`${name}=${quantityText}`);
  }

  return lines.length > 0 ? lines.join("\n") : "Padrão=";
}
