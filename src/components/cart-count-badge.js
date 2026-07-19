"use client";

import globalStyles from "@/app/storefront.module.css";
import { cx } from "@/src/lib/classnames";
import { useEffect, useState } from "react";

import { cartChangedEventName, getCartStorageKey } from "@/src/cart/cart-storage.js";

function readCartCount(userId) {
  try {
    const storedValue = window.localStorage.getItem(getCartStorageKey(userId));
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

export function CartCountBadge({ userId }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    function refreshCount() {
      setCount(readCartCount(userId));
    }

    refreshCount();
    window.addEventListener("storage", refreshCount);
    window.addEventListener(cartChangedEventName, refreshCount);

    return () => {
      window.removeEventListener("storage", refreshCount);
      window.removeEventListener(cartChangedEventName, refreshCount);
    };
  }, [userId]);

  return (
    <span aria-hidden="true" className={cx(globalStyles, "cart-count-badge")}>
      {count}
    </span>
  );
}
