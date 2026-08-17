export function getVariationStockStatus(product, variation, size = "") {
  const normalizedSize = String(size ?? "");
  const entry = Array.isArray(product?.variationStock)
    ? product.variationStock.find(
        (stock) => stock.variation === variation && String(stock.size ?? "") === normalizedSize
      )
    : null;

  // Produto com grade: par (variacao, tamanho) sem linha cadastrada nao existe
  // para venda. Estoque nulo continua significando "nao rastreado" somente no
  // catalogo sem tamanho, onde size e vazio.
  if (!entry && normalizedSize) {
    return {
      canAddToCart: false,
      label: "Indisponível",
      quantity: 0,
      status: "out"
    };
  }

  const quantity = Number.isInteger(entry?.quantity) ? entry.quantity : null;

  if (quantity === 0) {
    return {
      canAddToCart: false,
      label: "Esgotado",
      quantity,
      status: "out"
    };
  }

  if (quantity === null) {
    return {
      canAddToCart: true,
      label: "Consultar disponibilidade",
      quantity,
      status: "consult"
    };
  }

  return {
    canAddToCart: true,
    label: `${quantity} em estoque`,
    quantity,
    status: "in"
  };
}

export async function readCatalogVariationStock(client, productIds) {
  if (!client || productIds.length === 0) {
    return { rows: [] };
  }

  const { data, error } = await client
    .from("catalog_variation_stock")
    .select("product_id, variation, size, quantity")
    .in("product_id", productIds);

  if (error) {
    return { error, rows: [] };
  }

  return { rows: data ?? [] };
}

export function attachVariationStock(products, stockRows) {
  const stockByProduct = new Map();

  for (const row of stockRows ?? []) {
    const productStock = stockByProduct.get(row.product_id) ?? [];
    productStock.push({
      quantity: row.quantity,
      size: row.size ?? "",
      variation: row.variation
    });
    stockByProduct.set(row.product_id, productStock);
  }

  return products.map((product) => ({
    ...product,
    variationStock: stockByProduct.get(product.id) ?? []
  }));
}
