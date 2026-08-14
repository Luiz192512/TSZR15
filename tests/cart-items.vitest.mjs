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

  it("separa itens por tamanho e cai no primeiro tamanho quando o salvo nao existe", () => {
    const camiseta = {
      id: "camiseta",
      name: "Camiseta",
      priceCents: 8900,
      sizeOptions: ["P", "M"],
      variations: ["Padrão"]
    };

    expect(
      sanitizeCartItems(
        [
          { id: "camiseta", quantity: 1, size: "P", variation: "Padrão" },
          { id: "camiseta", quantity: 2, size: "M", variation: "Padrão" },
          { id: "camiseta", quantity: 1, size: "XG", variation: "Padrão" }
        ],
        [camiseta]
      )
    ).toMatchObject([
      { cartKey: "camiseta:Padrão:P", quantity: 2, size: "P" },
      { cartKey: "camiseta:Padrão:M", quantity: 2, size: "M" }
    ]);
  });

  it("mantem a chave sem tamanho para produtos sem grade", () => {
    expect(
      sanitizeCartItems([{ id: "slider", quantity: 1, size: "M", variation: "Preto" }], products)
    ).toMatchObject([{ cartKey: "slider:Preto", size: "" }]);
  });
});
