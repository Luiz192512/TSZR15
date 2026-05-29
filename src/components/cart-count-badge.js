"use client";

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

  useEffect(() => {
    function refreshCount() {
      setCount(readCartCount());
    }

    refreshCount();
    window.addEventListener("storage", refreshCount);
    window.addEventListener("tszr15-cart-changed", refreshCount);

    return () => {
      window.removeEventListener("storage", refreshCount);
      window.removeEventListener("tszr15-cart-changed", refreshCount);
    };
  }, []);

  return <span>{count}</span>;
}
