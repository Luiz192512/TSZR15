"use client";

import { useEffect, useState } from "react";

import {
  removeCartItem,
  sanitizeCartItems,
  updateCartItemQuantity,
  updateCartItemVariation
} from "@/src/cart/cart-items.js";
import { getVariationStockStatus } from "@/src/catalog/stock.js";
import { createBrowserSupabaseClient } from "@/src/lib/supabase/client.js";
import { clearStoredCart, readStoredCart, writeStoredCart } from "../catalog-shared.js";

export function useCart(products, resolvedUser) {
  const [cartItems, setCartItems] = useState([]);
  const [hasLoadedCart, setHasLoadedCart] = useState(false);
  const [cartSyncFeedback, setCartSyncFeedback] = useState("");
  const [syncedCartUserId, setSyncedCartUserId] = useState("");

  useEffect(() => {
    const sanitizedItems = sanitizeCartItems(readStoredCart(), products);
    setCartItems(sanitizedItems);
    setHasLoadedCart(true);
    writeStoredCart(sanitizedItems);
  }, [products]);

  useEffect(() => {
    if (!resolvedUser || !hasLoadedCart) return undefined;

    const supabase = createBrowserSupabaseClient();

    if (!supabase) {
      setSyncedCartUserId(resolvedUser.id);
      return undefined;
    }

    let isMounted = true;

    async function syncCart() {
      setCartSyncFeedback("");
      const { data, error } = await supabase
        .from("customer_carts")
        .select("items")
        .eq("user_id", resolvedUser.id)
        .maybeSingle();

      if (error) throw error;
      if (!isMounted) return;

      const remoteItems = sanitizeCartItems(data?.items, products);
      const nextItems = remoteItems.length ? remoteItems : cartItems;
      setCartItems(nextItems);
      const { error: upsertError } = await supabase
        .from("customer_carts")
        .upsert({ items: nextItems, user_id: resolvedUser.id });

      if (upsertError) throw upsertError;
      if (isMounted) setSyncedCartUserId(resolvedUser.id);
    }

    syncCart().catch(() => {
      if (isMounted) {
        setCartSyncFeedback(
          "Não foi possível sincronizar o carrinho agora. Ele continua salvo neste dispositivo."
        );
      }
    });

    return () => {
      isMounted = false;
    };
  }, [hasLoadedCart, products, resolvedUser]);

  useEffect(() => {
    if (!hasLoadedCart) return;
    writeStoredCart(cartItems);
  }, [cartItems, hasLoadedCart]);

  useEffect(() => {
    if (!resolvedUser || !hasLoadedCart || syncedCartUserId !== resolvedUser.id) return undefined;
    const supabase = createBrowserSupabaseClient();
    if (!supabase) return undefined;

    let isMounted = true;

    supabase
      .from("customer_carts")
      .upsert({ items: cartItems, user_id: resolvedUser.id })
      .then(({ error }) => {
        if (error && isMounted) {
          setCartSyncFeedback(
            "Não foi possível atualizar o carrinho na sua conta. Ele continua salvo neste dispositivo."
          );
        }
      });

    return () => {
      isMounted = false;
    };
  }, [cartItems, hasLoadedCart, resolvedUser, syncedCartUserId]);

  return {
    cartItems,
    cartSyncFeedback,
    clearCart: () => {
      clearStoredCart();
      setCartItems([]);
    },
    deleteItem: (cartKey) => setCartItems((currentItems) => removeCartItem(currentItems, cartKey)),
    hasLoadedCart,
    setCartItems,
    updateQuantity: (cartKey, nextQuantity) =>
      setCartItems((currentItems) => {
        const item = currentItems.find((currentItem) => currentItem.cartKey === cartKey);
        const product = products.find((currentProduct) => currentProduct.id === item?.id);
        const stock = getVariationStockStatus(product, item?.variation);
        const limitedQuantity =
          stock.quantity === null ? nextQuantity : Math.min(nextQuantity, stock.quantity);

        return updateCartItemQuantity(currentItems, cartKey, limitedQuantity);
      }),
    updateVariation: (cartKey, nextVariation) =>
      setCartItems((currentItems) =>
        updateCartItemVariation(currentItems, products, cartKey, nextVariation)
      )
  };
}
