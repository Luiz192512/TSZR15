export function getCartItemKey(productId, variation) {
  return `${productId}:${variation}`;
}

export function sanitizeCartItems(items, products) {
  const productsById = new Map(products.map((product) => [product.id, product]));
  const productsBySlug = new Map(products.map((product) => [product.slug, product]));
  const itemsByKey = new Map();

  for (const item of items) {
    const product = productsById.get(item?.id) ?? productsBySlug.get(item?.slug);
    const quantity = Number(item?.quantity);

    if (!product || !Number.isInteger(quantity) || quantity < 1) {
      continue;
    }

    const variation = product.variations.includes(item?.variation)
      ? item.variation
      : product.variations[0];
    const cartKey = getCartItemKey(product.id, variation);
    const currentItem = itemsByKey.get(cartKey);

    itemsByKey.set(cartKey, {
      cartKey,
      id: product.id,
      name: product.name,
      priceCents: product.priceCents,
      productFamily: product.productFamily,
      quantity: (currentItem?.quantity ?? 0) + quantity,
      slug: product.slug,
      variation
    });
  }

  return Array.from(itemsByKey.values());
}

export function updateCartItemQuantity(items, cartKey, nextQuantity) {
  return items
    .map((item) =>
      item.cartKey === cartKey ? { ...item, quantity: Math.max(nextQuantity, 0) } : item
    )
    .filter((item) => item.quantity > 0);
}

export function removeCartItem(items, cartKey) {
  return items.filter((item) => item.cartKey !== cartKey);
}

export function updateCartItemVariation(items, products, cartKey, nextVariation) {
  const currentItem = items.find((item) => item.cartKey === cartKey);

  if (!currentItem || currentItem.variation === nextVariation) {
    return items;
  }

  const productsById = new Map(products.map((product) => [product.id, product]));
  const product = productsById.get(currentItem.id);

  if (!product || !product.variations.includes(nextVariation)) {
    return items;
  }

  const nextCartKey = getCartItemKey(product.id, nextVariation);
  const updatedItem = {
    ...currentItem,
    cartKey: nextCartKey,
    name: product.name,
    priceCents: product.priceCents,
    productFamily: product.productFamily,
    slug: product.slug,
    variation: nextVariation
  };
  const itemsWithoutCurrent = items.filter((item) => item.cartKey !== cartKey);
  const existingItem = itemsWithoutCurrent.find((item) => item.cartKey === nextCartKey);

  if (!existingItem) {
    return [...itemsWithoutCurrent, updatedItem];
  }

  return itemsWithoutCurrent.map((item) =>
    item.cartKey === nextCartKey
      ? { ...item, quantity: item.quantity + currentItem.quantity }
      : item
  );
}
