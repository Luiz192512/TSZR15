import { describe, expect, it } from "vitest";

import { sanitizeCartItems, updateCartItemQuantity } from "../src/cart/cart-items.js";

const products = [{ id: "slider", name: "Slider", priceCents: 1000, variations: ["Preto"] }];

describe("cart items", () => {
  it("removes invalid products and keeps a valid item", () => {
    expect(
      sanitizeCartItems([{ id: "slider", quantity: 2, variation: "Preto" }, { id: "x" }], products)
    ).toMatchObject([{ cartKey: "slider:Preto", id: "slider", quantity: 2, variation: "Preto" }]);
  });

  it("removes an item when its quantity reaches zero", () => {
    const [item] = sanitizeCartItems([{ id: "slider", quantity: 1, variation: "Preto" }], products);
    expect(updateCartItemQuantity([item], item.cartKey, 0)).toEqual([]);
  });
});
