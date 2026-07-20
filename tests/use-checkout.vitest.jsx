/** @vitest-environment jsdom */

import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useCheckout } from "../src/components/catalog/hooks/use-checkout.js";

function checkoutProps(overrides = {}) {
  return {
    appliedCoupon: null,
    autoFilledAddressLine: "",
    cartItems: [
      {
        id: "slider",
        name: "Slider Esportivo",
        priceCents: 14990,
        quantity: 1,
        variation: "Preto"
      }
    ],
    clearCart: vi.fn(),
    customer: {
      address: "Rua Teste, 123 - Sao Paulo/SP",
      cep: "01001-000",
      name: "Cliente Teste",
      phone: "",
      taxId: "123.456.789-00",
      whatsapp: "(11) 98888-7777"
    },
    hasDataConsent: true,
    paymentMethodId: "pix",
    shippingOptionId: "pac-estimado",
    storeName: "TSZR15",
    ...overrides
  };
}

describe("useCheckout", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("abre a aba do WhatsApp antes de aguardar a API", async () => {
    const sequence = [];
    const popup = {
      close: vi.fn(),
      location: { replace: vi.fn() },
      opener: window
    };
    const open = vi.spyOn(window, "open").mockImplementation(() => {
      sequence.push("open");
      return popup;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () => {
        sequence.push("fetch");
        return {
          json: async () => ({
            order: { orderNumber: "TSZ-1", saved: true },
            whatsappUrl: "https://wa.me/5511999999999"
          }),
          ok: true
        };
      })
    );
    const props = checkoutProps();
    const { result } = renderHook(() => useCheckout(props));

    await act(async () => result.current.submitCheckout());

    expect(sequence).toEqual(["open", "fetch"]);
    expect(open).toHaveBeenCalledOnce();
    expect(popup.location.replace).toHaveBeenCalledWith("https://wa.me/5511999999999");
    expect(props.clearCart).toHaveBeenCalledOnce();
  });

  it("nao cria pedido nem limpa o carrinho quando o popup e bloqueado", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    vi.spyOn(window, "open").mockReturnValue(null);
    const props = checkoutProps();
    const { result } = renderHook(() => useCheckout(props));

    await act(async () => result.current.submitCheckout());

    expect(fetch).not.toHaveBeenCalled();
    expect(props.clearCart).not.toHaveBeenCalled();
    expect(result.current.checkoutFeedback).toMatch(/pop-up/i);
  });
});
