/** @vitest-environment jsdom */

import { beforeEach, describe, expect, it } from "vitest";

import {
  getCartStorageKey,
  migrateGuestCartToUser,
  readStoredCart,
  writeStoredCart
} from "../src/cart/cart-storage.js";

// O jsdom do Vitest neste projeto delega window.localStorage ao webstorage do
// Node, que fica sem backing file no runner — substituimos por um stub em memoria.
function createLocalStorageStub() {
  const entries = new Map();

  return {
    getItem: (key) => (entries.has(key) ? entries.get(key) : null),
    removeItem: (key) => entries.delete(key),
    setItem: (key, value) => entries.set(key, String(value))
  };
}

function storedItems(userId) {
  const rawValue = window.localStorage.getItem(getCartStorageKey(userId));
  return rawValue ? JSON.parse(rawValue) : [];
}

describe("migrateGuestCartToUser", () => {
  beforeEach(() => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: createLocalStorageStub()
    });
  });

  it("move os itens do carrinho de convidado para o carrinho do usuario no login", () => {
    writeStoredCart(
      [
        { cartKey: "slider::preto", id: "slider", quantity: 2, variation: "Preto" },
        { cartKey: "manete::azul", id: "manete", quantity: 1, variation: "Azul" }
      ],
      ""
    );

    migrateGuestCartToUser("user-a");

    expect(storedItems("user-a").map((item) => item.cartKey)).toEqual([
      "slider::preto",
      "manete::azul"
    ]);
    expect(storedItems("")).toEqual([]);
    expect(readStoredCart("user-a")).toHaveLength(2);
  });

  it("mantem a quantidade do carrinho do usuario quando o item ja existe nas duas chaves", () => {
    writeStoredCart([{ cartKey: "slider::preto", id: "slider", quantity: 5 }], "user-a");
    writeStoredCart([{ cartKey: "slider::preto", id: "slider", quantity: 1 }], "");

    migrateGuestCartToUser("user-a");

    expect(storedItems("user-a")).toEqual([{ cartKey: "slider::preto", id: "slider", quantity: 5 }]);
    expect(storedItems("")).toEqual([]);
  });

  it("nao mexe em nada sem usuario autenticado", () => {
    writeStoredCart([{ cartKey: "slider::preto", id: "slider", quantity: 2 }], "");

    migrateGuestCartToUser("");
    migrateGuestCartToUser(null);

    expect(storedItems("")).toHaveLength(1);
  });

  it("nao toca no carrinho do usuario quando nao ha carrinho de convidado", () => {
    writeStoredCart([{ cartKey: "slider::preto", id: "slider", quantity: 3 }], "user-a");

    migrateGuestCartToUser("user-a");

    expect(storedItems("user-a")).toEqual([{ cartKey: "slider::preto", id: "slider", quantity: 3 }]);
  });
});
