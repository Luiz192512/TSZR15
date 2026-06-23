"use client";

import globalStyles from "@/src/styles/storefront-styles.js";
import { cx } from "@/src/lib/classnames";
import { useEffect, useState } from "react";

const cartStorageKey = "tszr15-cart";

function readCartCount() {
  try {
    const storedValue = window.localStorage.getItem(cartStorageKey);
    const parsedItems = storedValue ? JSON.parse(storedValue) : [];

    if (!Array.isArray(parsedItems)) {
      return 0;
    }

    return parsedItems.reduce((total, item) => {
      const quantity = Number(item?.quantity);
      return total + (Number.isFinite(quantity) && quantity > 0 ? quantity : 0);
    }, 0);
  } catch {
    return 0;
  }
}

export function CartCountBadge() {
  const [count, setCount] = useState(0);
  const [isBumping, setIsBumping] = useState(false);

  useEffect(() => {
    function refreshCount() {
      setCount(readCartCount());
    }

    function animateAddedCart() {
      refreshCount();
      setIsBumping(true);
      window.setTimeout(() => setIsBumping(false), 300);
    }

    refreshCount();
    window.addEventListener("storage", refreshCount);
    window.addEventListener("tszr15-cart-changed", refreshCount);
    window.addEventListener("tszr15-cart-added", animateAddedCart);

    return () => {
      window.removeEventListener("storage", refreshCount);
      window.removeEventListener("tszr15-cart-changed", refreshCount);
      window.removeEventListener("tszr15-cart-added", animateAddedCart);
    };
  }, []);

  return (
    <span
      aria-hidden="true"
      className={cx(globalStyles, `cart-count-badge ${isBumping ? "is-bumping" : ""}`)}
    >
      {count}
    </span>
  );
}
