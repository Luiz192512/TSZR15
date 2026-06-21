/** @vitest-environment jsdom */

import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useCoupon } from "../src/components/catalog/hooks/use-coupon.js";

describe("useCoupon", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("não chama a API quando não há itens no carrinho", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const { result } = renderHook(() => useCoupon({ cartItems: [], shippingOptionId: "standard" }));

    act(() => result.current.updateCouponCode("R15"));
    await act(async () => result.current.applyCoupon());

    expect(fetch).not.toHaveBeenCalled();
    expect(result.current.couponFeedback).toBe("Adicione itens antes de aplicar cupom.");
  });

  it("limpa o cupom aplicado quando o carrinho muda", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: async () => ({ coupon: { code: "R15" } }),
        ok: true
      })
    );
    const initialItems = [{ id: "slider", quantity: 1, variation: "Preto" }];
    const { result, rerender } = renderHook(
      ({ cartItems }) => useCoupon({ cartItems, shippingOptionId: "standard" }),
      { initialProps: { cartItems: initialItems } }
    );

    act(() => result.current.updateCouponCode("r15"));
    await act(async () => result.current.applyCoupon());
    expect(result.current.appliedCoupon).toEqual({ code: "R15" });

    rerender({ cartItems: [{ ...initialItems[0], quantity: 2 }] });
    expect(result.current.appliedCoupon).toBeNull();
    expect(result.current.couponFeedback).toBe("Carrinho alterado. Aplique o cupom novamente.");
  });
});
