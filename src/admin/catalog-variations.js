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

function parseVariationCards(value) {
  if (!String(value ?? "").trim()) {
    return null;
  }

  try {
    const cards = JSON.parse(String(value));

    if (!Array.isArray(cards)) {
      throw new Error();
    }

    return cards.slice(0, 24);
  } catch {
    throw new Error("Os cards de variação enviados são inválidos.");
  }
}

function legacyVariationCards(value) {
  return String(value ?? "")
    .split(/\r?\n/)
    .slice(0, 24)
    .map((line) => {
      const separatorIndex = line.indexOf("=");

      return {
        imageTokens: [],
        quantity: separatorIndex >= 0 ? line.slice(separatorIndex + 1) : "",
        variation: separatorIndex >= 0 ? line.slice(0, separatorIndex) : line,
      };
    });
}

export function collectAdminVariationInventory(formData) {
  const cards =
    parseVariationCards(formData.get("variationCards")) ??
    legacyVariationCards(formData.get("variationInventory"));
  const seenNames = new Set();
  const stock = [];
  const variationImageTokens = [];
  let imageCount = 0;

  for (const card of cards) {
    const rawName = cleanVariationName(card?.variation);
    const rawQuantity = card?.quantity ?? "";

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
    const imageTokens = Array.isArray(card?.imageTokens)
      ? card.imageTokens
          .map((token) =>
            String(token ?? "")
              .trim()
              .slice(0, 900),
          )
          .filter(Boolean)
          .slice(0, Math.max(0, 12 - imageCount))
      : [];
    imageCount += imageTokens.length;
    variationImageTokens.push({ imageTokens, variation });
  }

  if (stock.length === 0) {
    throw new Error("Informe pelo menos uma variação.");
  }

  return {
    stock,
    variationImageTokens,
    variations: stock.map((entry) => entry.variation),
  };
}
