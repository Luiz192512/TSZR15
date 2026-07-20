export const guestCartStorageKey = "tszr15-cart";
export const cartChangedEventName = "tszr15-cart-changed";

export function getCartStorageKey(userId) {
  const normalizedUserId = String(userId ?? "").trim();

  return normalizedUserId
    ? `${guestCartStorageKey}:user:${encodeURIComponent(normalizedUserId)}`
    : guestCartStorageKey;
}

export function readStoredCart(userId) {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const storedValue = window.localStorage.getItem(getCartStorageKey(userId));
    const parsedItems = storedValue ? JSON.parse(storedValue) : [];

    return Array.isArray(parsedItems) ? parsedItems : [];
  } catch {
    return [];
  }
}

export function writeStoredCart(items, userId) {
  if (typeof window === "undefined") {
    return;
  }

  const storageKey = getCartStorageKey(userId);

  if (!Array.isArray(items) || items.length === 0) {
    window.localStorage.removeItem(storageKey);
  } else {
    window.localStorage.setItem(storageKey, JSON.stringify(items));
  }

  window.dispatchEvent(new Event(cartChangedEventName));
}

export function migrateGuestCartToUser(userId) {
  if (typeof window === "undefined") {
    return;
  }

  const normalizedUserId = String(userId ?? "").trim();

  if (!normalizedUserId) {
    return;
  }

  const guestItems = readStoredCart("");

  if (guestItems.length === 0) {
    return;
  }

  const userItems = readStoredCart(normalizedUserId);
  const userCartKeys = new Set(userItems.map((item) => item?.cartKey));
  const migratedItems = [
    ...userItems,
    ...guestItems.filter((item) => !userCartKeys.has(item?.cartKey))
  ];

  writeStoredCart(migratedItems, normalizedUserId);
  window.localStorage.removeItem(getCartStorageKey(""));
}

export function clearStoredCart(userId) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(getCartStorageKey(userId));
  window.dispatchEvent(new Event(cartChangedEventName));
}
