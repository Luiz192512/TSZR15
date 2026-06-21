"use client";

import { useEffect, useState } from "react";

export function useCoupon({ cartItems, shippingOptionId }) {
  const [couponCode, setCouponCode] = useState("");
  const [couponFeedback, setCouponFeedback] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [isValidatingCoupon, setIsValidatingCoupon] = useState(false);

  useEffect(() => {
    if (!appliedCoupon) return;

    setAppliedCoupon(null);
    setCouponFeedback("Carrinho alterado. Aplique o cupom novamente.");
  }, [cartItems]);

  function updateCouponCode(value) {
    setCouponCode(value);
    if (appliedCoupon) setAppliedCoupon(null);
  }

  async function applyCoupon() {
    const normalizedCode = couponCode
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_-]/g, "")
      .slice(0, 40);

    setCouponCode(normalizedCode);

    if (!normalizedCode) {
      setAppliedCoupon(null);
      setCouponFeedback("Informe um cupom.");
      return;
    }

    if (cartItems.length === 0) {
      setAppliedCoupon(null);
      setCouponFeedback("Adicione itens antes de aplicar cupom.");
      return;
    }

    setCouponFeedback("");
    setIsValidatingCoupon(true);

    try {
      const response = await fetch("/api/coupons/validate", {
        body: JSON.stringify({ cartItems, couponCode: normalizedCode, shippingOptionId }),
        headers: { "Content-Type": "application/json" },
        method: "POST"
      });
      const data = await response.json();

      if (!response.ok) throw new Error(data.error || "Cupom inválido.");

      setAppliedCoupon(data.coupon);
      setCouponFeedback(`Cupom ${data.coupon.code} aplicado.`);
    } catch (error) {
      setAppliedCoupon(null);
      setCouponFeedback(error instanceof Error ? error.message : "Cupom inválido.");
    } finally {
      setIsValidatingCoupon(false);
    }
  }

  return {
    appliedCoupon,
    applyCoupon,
    couponCode,
    couponFeedback,
    isValidatingCoupon,
    updateCouponCode
  };
}
