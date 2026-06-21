"use client";

import { useMemo, useState } from "react";

import { validateCustomerFieldFormats } from "@/src/customer/field-validation.js";
import { buildWhatsAppOrderMessage, calculateCartTotals } from "@/src/checkout/whatsapp.js";

export function useCheckout({
  appliedCoupon,
  autoFilledAddressLine,
  cartItems,
  clearCart,
  customer,
  hasDataConsent,
  paymentMethodId,
  shippingOptionId,
  storeName
}) {
  const [checkoutFeedback, setCheckoutFeedback] = useState("");
  const [isSubmittingCheckout, setIsSubmittingCheckout] = useState(false);
  const totals = useMemo(
    () =>
      calculateCartTotals(cartItems, shippingOptionId, {
        discountCents: appliedCoupon?.discountCents ?? 0
      }),
    [appliedCoupon, cartItems, shippingOptionId]
  );
  const customerFieldErrors = useMemo(
    () =>
      validateCustomerFieldFormats({
        cep: customer.cep,
        phone: customer.phone,
        taxId: customer.taxId,
        whatsapp: customer.whatsapp
      }),
    [customer.cep, customer.phone, customer.taxId, customer.whatsapp]
  );
  const hasAutoFilledAddressPendingEdit = Boolean(
    autoFilledAddressLine && customer.address.trim() === autoFilledAddressLine.trim()
  );
  const hasRequiredCustomerData = Boolean(
    customer.name &&
    (customer.whatsapp || customer.phone) &&
    customer.cep &&
    customer.address &&
    !hasAutoFilledAddressPendingEdit
  );
  const canCheckout =
    cartItems.length > 0 &&
    hasDataConsent &&
    hasRequiredCustomerData &&
    customerFieldErrors.length === 0;
  const whatsappMessage = useMemo(
    () =>
      buildWhatsAppOrderMessage({
        cartItems,
        coupon: appliedCoupon,
        customer,
        paymentMethodId,
        shippingOptionId,
        storeName
      }),
    [appliedCoupon, cartItems, customer, paymentMethodId, shippingOptionId, storeName]
  );

  async function submitCheckout() {
    if (!canCheckout || isSubmittingCheckout) {
      if (customerFieldErrors.length > 0) setCheckoutFeedback(customerFieldErrors[0]);
      return;
    }

    setCheckoutFeedback("");
    setIsSubmittingCheckout(true);

    try {
      const response = await fetch("/api/checkout/whatsapp", {
        body: JSON.stringify({
          cartItems,
          couponCode: appliedCoupon?.code ?? "",
          customer,
          hasDataConsent,
          paymentMethodId,
          shippingOptionId
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST"
      });
      const data = await response.json();
      const details = Array.isArray(data.details) ? data.details.join(" ") : "";

      if (!response.ok) throw new Error([data.error, details].filter(Boolean).join(" "));
      if (!data.whatsappUrl) throw new Error("Número do WhatsApp Business não configurado.");

      setCheckoutFeedback(
        data.order?.saved && data.order?.orderNumber
          ? `Pedido ${data.order.orderNumber} salvo. Abrindo WhatsApp.`
          : data.order?.reason
            ? `Mensagem pronta. ${data.order.reason}`
            : "Mensagem pronta. Abrindo WhatsApp."
      );
      clearCart();
      window.open(data.whatsappUrl, "_blank", "noopener,noreferrer");
    } catch (error) {
      setCheckoutFeedback(
        error instanceof Error ? error.message : "Não foi possível finalizar o pedido agora."
      );
    } finally {
      setIsSubmittingCheckout(false);
    }
  }

  return {
    canCheckout,
    checkoutFeedback,
    customerFieldErrors,
    hasAutoFilledAddressPendingEdit,
    hasRequiredCustomerData,
    isSubmittingCheckout,
    submitCheckout,
    totals,
    whatsappMessage
  };
}
