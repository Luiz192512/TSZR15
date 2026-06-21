"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { buildAddressLine } from "@/src/customer/customer-data.js";
import { getVariationStockStatus } from "@/src/catalog/stock.js";
import { createBrowserSupabaseClient } from "@/src/lib/supabase/client.js";
import { getInitialCustomer, StoreHeader, storeName } from "./catalog-shared.js";
import { CartItemsPanel } from "./cart-items-panel.js";
import { CheckoutSummaryPanel } from "./checkout-summary-panel.js";
import { useCart } from "./hooks/use-cart.js";
import { useCepLookup } from "./hooks/use-cep-lookup.js";
import { useCheckout } from "./hooks/use-checkout.js";
import { useCoupon } from "./hooks/use-coupon.js";

export function CartCheckout({ currentUser, initialCustomer, isSupabaseConfigured, products }) {
  const [paymentMethodId, setPaymentMethodId] = useState("pix");
  const [shippingOptionId, setShippingOptionId] = useState("combinar");
  const [hasDataConsent, setHasDataConsent] = useState(Boolean(currentUser));
  const [customer, setCustomer] = useState(() => getInitialCustomer(initialCustomer));
  const [resolvedUser, setResolvedUser] = useState(currentUser ?? null);
  const initialCustomerHadAddress = useRef(Boolean(initialCustomer?.address));
  const productsById = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products]
  );

  useEffect(() => {
    if (currentUser) {
      setResolvedUser(currentUser);
      setHasDataConsent(true);
      return undefined;
    }

    const supabase = createBrowserSupabaseClient();
    if (!supabase) return undefined;

    let isMounted = true;

    async function loadCustomerData() {
      try {
        const {
          data: { user }
        } = await supabase.auth.getUser();

        if (!isMounted || !user) return;

        setResolvedUser(user);
        setHasDataConsent(true);
        const [{ data: profile }, { data: address }] = await Promise.all([
          supabase.from("customer_profiles").select("*").eq("user_id", user.id).maybeSingle(),
          supabase
            .from("customer_addresses")
            .select("*")
            .eq("user_id", user.id)
            .order("is_default", { ascending: false })
            .order("updated_at", { ascending: false })
            .limit(1)
            .maybeSingle()
        ]);

        if (!isMounted) return;

        const addressLine = buildAddressLine(address);
        if (addressLine) initialCustomerHadAddress.current = true;

        setCustomer((current) => ({
          ...current,
          address: current.address || addressLine,
          cep: current.cep || address?.cep || "",
          email: current.email || profile?.email || user.email || "",
          name: current.name || profile?.full_name || "",
          phone: current.phone || profile?.phone || "",
          taxId: current.taxId || profile?.tax_id || "",
          whatsapp: current.whatsapp || profile?.whatsapp || ""
        }));
      } catch {
        if (isMounted) setResolvedUser(null);
      }
    }

    loadCustomerData();
    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, session) =>
      setResolvedUser(session?.user ?? null)
    );

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [currentUser]);

  const cart = useCart(products, resolvedUser);
  const cep = useCepLookup({ customer, initialCustomerHadAddress, setCustomer });
  const coupon = useCoupon({ cartItems: cart.cartItems, shippingOptionId });
  const checkout = useCheckout({
    appliedCoupon: coupon.appliedCoupon,
    autoFilledAddressLine: cep.autoFilledAddressLine,
    cartItems: cart.cartItems,
    clearCart: cart.clearCart,
    customer,
    hasDataConsent,
    paymentMethodId,
    shippingOptionId,
    storeName
  });

  function updateCustomer(field, value) {
    setCustomer((current) => ({ ...current, [field]: value }));
  }

  function updateVariation(cartKey, variation) {
    const cartItem = cart.cartItems.find((item) => item.cartKey === cartKey);
    const product = productsById.get(cartItem?.id);

    if (!getVariationStockStatus(product, variation).canAddToCart) {
      return;
    }

    cart.updateVariation(cartKey, variation);
  }

  return (
    <>
      <StoreHeader currentUser={resolvedUser} showSearch={false} />

      <section className="cart-heading">
        <div>
          <p className="section-label">Carrinho de compra</p>
          <h1>Revise seu pedido.</h1>
        </div>
        <Link className="button button-secondary" href="/">
          Continuar comprando
        </Link>
      </section>

      <section className="cart-page-layout">
        <CartItemsPanel
          cartItems={cart.cartItems}
          hasLoadedCart={cart.hasLoadedCart}
          onDelete={cart.deleteItem}
          onQuantity={cart.updateQuantity}
          onVariation={updateVariation}
          productsById={productsById}
          subtotalCents={checkout.totals.subtotalCents}
          syncFeedback={cart.cartSyncFeedback}
        />

        <CheckoutSummaryPanel
          canCheckout={checkout.canCheckout}
          cartItems={cart.cartItems}
          cepLookup={cep.cepLookup}
          checkoutFeedback={checkout.checkoutFeedback}
          couponCode={coupon.couponCode}
          couponFeedback={coupon.couponFeedback}
          customer={customer}
          customerFieldErrors={checkout.customerFieldErrors}
          hasAutoFilledAddressPendingEdit={checkout.hasAutoFilledAddressPendingEdit}
          hasDataConsent={hasDataConsent}
          hasRequiredCustomerData={checkout.hasRequiredCustomerData}
          isAuthenticated={Boolean(resolvedUser)}
          isSubmittingCheckout={checkout.isSubmittingCheckout}
          isSupabaseConfigured={isSupabaseConfigured}
          isValidatingCoupon={coupon.isValidatingCoupon}
          onApplyCoupon={coupon.applyCoupon}
          onCouponCodeChange={coupon.updateCouponCode}
          onCustomerChange={updateCustomer}
          onDataConsentChange={setHasDataConsent}
          onPaymentMethodChange={setPaymentMethodId}
          onShippingOptionChange={setShippingOptionId}
          onSubmitCheckout={checkout.submitCheckout}
          onUpdateCep={cep.updateCep}
          paymentMethodId={paymentMethodId}
          shippingOptionId={shippingOptionId}
          totals={checkout.totals}
          whatsappMessage={checkout.whatsappMessage}
        />
      </section>
    </>
  );
}
