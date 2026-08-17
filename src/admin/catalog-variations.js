const canonicalVariationNames = new Map([
  ["aluminio", "Alumínio"],
  ["fume", "Fumê"],
  ["holografico", "Holográfico"],
  ["padrao", "Padrão"],
]);

const maxSizesPerVariation = 12;
const maxSizeNameLength = 40;

function cleanVariationName(value) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 120);
}

function cleanSizeName(value) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, maxSizeNameLength);
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

// O separador de campos do marcador estoque_insuficiente:<produto>|<variacao>|
// <tamanho> emitido pela RPC de reserva. Aceitar "|" no rotulo tornaria a
// mensagem ambigua no parser do checkout.
function rejectFieldSeparator(value, label) {
  if (value.includes("|")) {
    throw new Error(`O caractere "|" não é permitido em ${label}.`);
  }
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

// Cada card vira uma linha de estoque sem tamanho (size "") ou uma linha por
// tamanho informado. Grade livre: o rotulo e o que o admin digitou.
function collectCardSizes(card, variation) {
  const rawSizes = Array.isArray(card?.sizes) ? card.sizes : [];
  const seenSizes = new Set();
  const sizes = [];

  for (const entry of rawSizes.slice(0, maxSizesPerVariation)) {
    const size = cleanSizeName(entry?.size);

    if (!size && !String(entry?.quantity ?? "").trim()) {
      continue;
    }

    if (!size) {
      throw new Error(
        `Informe o nome de cada tamanho da variação ${variation}.`,
      );
    }

    rejectFieldSeparator(size, "nome de tamanho");

    const normalizedSize = size.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

    if (seenSizes.has(normalizedSize)) {
      throw new Error(
        `O tamanho ${size} foi informado mais de uma vez na variação ${variation}.`,
      );
    }

    seenSizes.add(normalizedSize);
    sizes.push({
      quantity: parseVariationQuantity(entry?.quantity, `${variation} (${size})`),
      size,
    });
  }

  return sizes;
}

export function collectAdminVariationInventory(formData) {
  const cards =
    parseVariationCards(formData.get("variationCards")) ??
    legacyVariationCards(formData.get("variationInventory"));
  const seenNames = new Set();
  const seenSizeOptions = new Set();
  const sizeOptions = [];
  const stock = [];
  const variationImageTokens = [];
  let imageCount = 0;

  for (const card of cards) {
    const rawName = cleanVariationName(card?.variation);
    const rawQuantity = card?.quantity ?? "";
    const hasSizes = Array.isArray(card?.sizes) && card.sizes.length > 0;

    if (!rawName && !String(rawQuantity).trim() && !hasSizes) {
      continue;
    }

    if (!rawName) {
      throw new Error(
        "Informe o nome de cada variação com estoque preenchido.",
      );
    }

    const variation = canonicalizeVariationName(rawName);
    const normalizedName = normalizeVariationName(variation);

    rejectFieldSeparator(variation, "nome de variação");

    if (seenNames.has(normalizedName)) {
      throw new Error(`A variação ${variation} foi informada mais de uma vez.`);
    }

    seenNames.add(normalizedName);

    const cardSizes = collectCardSizes(card, variation);

    if (cardSizes.length === 0) {
      stock.push({
        quantity: parseVariationQuantity(rawQuantity, variation),
        size: "",
        variation,
      });
    } else {
      for (const entry of cardSizes) {
        stock.push({
          quantity: entry.quantity,
          size: entry.size,
          variation,
        });

        if (!seenSizeOptions.has(entry.size)) {
          seenSizeOptions.add(entry.size);
          sizeOptions.push(entry.size);
        }
      }
    }

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
    sizeOptions,
    stock,
    variationImageTokens,
    // Uma entrada por variação processada, na ordem dos cards — stock agora
    // repete a variação uma vez por tamanho.
    variations: variationImageTokens.map((group) => group.variation),
  };
}
