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

  it("separa itens por tamanho e descarta tamanho fora da grade", () => {
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
      // "XG" nao esta na grade: o item e descartado em vez de virar "P".
      { cartKey: "camiseta:Padrão:P", quantity: 1, size: "P" },
      { cartKey: "camiseta:Padrão:M", quantity: 2, size: "M" }
    ]);
  });

  it("descarta item salvo antes da grade em vez de escolher um tamanho", () => {
    const camiseta = {
      id: "camiseta",
      name: "Camiseta",
      priceCents: 8900,
      sizeOptions: ["P", "M"],
      variations: ["Padrão"]
    };

    // Item guardado quando o produto ainda nao tinha grade: nao da para
    // adivinhar o tamanho que o cliente queria.
    expect(sanitizeCartItems([{ id: "camiseta", quantity: 1, variation: "Padrão" }], [camiseta])).toEqual(
      []
    );

    // Com tamanho valido, continua no carrinho.
    expect(
      sanitizeCartItems([{ id: "camiseta", quantity: 1, size: "M", variation: "Padrão" }], [camiseta])
    ).toMatchObject([{ cartKey: "camiseta:Padrão:M", size: "M" }]);
  });

  it("mantem a chave sem tamanho para produtos sem grade", () => {
    expect(
      sanitizeCartItems([{ id: "slider", quantity: 1, size: "M", variation: "Preto" }], products)
    ).toMatchObject([{ cartKey: "slider:Preto", size: "" }]);
  });
});
