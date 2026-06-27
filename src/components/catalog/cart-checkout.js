"use client";

import globalStyles from "@/app/storefront.module.css";
import { cx } from "@/src/lib/classnames";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { saveCheckoutAddressAction } from "@/app/pedido/actions.js";
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

const emptyNewAddress = {
  cep: "",
  city: "",
  complement: "",
  district: "",
  label: "",
  number: "",
  state: "",
  street: ""
};

function pickDefaultAddressId(addresses) {
  const preferred = addresses.find((address) => address.is_default) ?? addresses[0];
  return preferred?.id ?? "";
}

export function CartCheckout({
  currentUser,
  initialAddresses = [],
  initialCustomer,
  isSupabaseConfigured,
  products
}) {
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

  const [addresses, setAddresses] = useState(initialAddresses);
  const [selectedAddressId, setSelectedAddressId] = useState(() =>
    pickDefaultAddressId(initialAddresses)
  );
  const [isAddingAddress, setIsAddingAddress] = useState(initialAddresses.length === 0);
  const [newAddress, setNewAddress] = useState(emptyNewAddress);
  const [isSavingAddress, setIsSavingAddress] = useState(false);
  const [addressFeedback, setAddressFeedback] = useState("");
  const [showNotes, setShowNotes] = useState(Boolean(initialCustomer?.notes));

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
        const [{ data: profile }, { data: addressRows }] = await Promise.all([
          supabase.from("customer_profiles").select("*").eq("user_id", user.id).maybeSingle(),
          supabase
            .from("customer_addresses")
            .select("*")
            .eq("user_id", user.id)
            .order("is_default", { ascending: false })
            .order("updated_at", { ascending: false })
        ]);

        if (!isMounted) return;

        const addressList = addressRows ?? [];
        const defaultAddress = addressList.find((item) => item.is_default) ?? addressList[0] ?? null;
        const addressLine = buildAddressLine(defaultAddress);
        if (addressLine) initialCustomerHadAddress.current = true;
        if (addressList.length) {
          setAddresses(addressList);
          setSelectedAddressId(pickDefaultAddressId(addressList));
          setIsAddingAddress(false);
        }

        setCustomer((current) => ({
          ...current,
          address: current.address || addressLine,
          cep: current.cep || defaultAddress?.cep || "",
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

  function applySelectedAddress(address) {
    if (!address) return;
    initialCustomerHadAddress.current = true;
    setCustomer((current) => ({
      ...current,
      address: buildAddressLine(address),
      cep: address.cep || ""
    }));
  }

  function selectAddress(addressId) {
    setSelectedAddressId(addressId);
    applySelectedAddress(addresses.find((address) => address.id === addressId));
  }

  function updateNewAddress(field, value) {
    setNewAddress((current) => ({ ...current, [field]: value }));
  }

  async function lookupNewAddressCep(rawCep) {
    const digits = String(rawCep ?? "").replace(/\D/g, "");
    if (digits.length !== 8) return;

    try {
      const response = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const data = await response.json();
      if (!data || data.erro) return;
      setNewAddress((current) => ({
        ...current,
        city: current.city || data.localidade || "",
        district: current.district || data.bairro || "",
        state: current.state || data.uf || "",
        street: current.street || data.logradouro || ""
      }));
    } catch {
      // CEP lookup is best-effort; user can fill the fields manually.
    }
  }

  async function saveNewAddress() {
    setIsSavingAddress(true);
    setAddressFeedback("");
    const result = await saveCheckoutAddressAction(newAddress);
    setIsSavingAddress(false);

    if (result?.error) {
      setAddressFeedback(result.error);
      return;
    }

    const saved = result.address;
    setAddresses((list) => [saved, ...list.map((item) => ({ ...item, is_default: false }))]);
    setSelectedAddressId(saved.id);
    applySelectedAddress(saved);
    setNewAddress(emptyNewAddress);
    setIsAddingAddress(false);
    setAddressFeedback("Endereço salvo na sua conta.");
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

      <section className={cx(globalStyles, "cart-heading")}>
        <div>
          <p className={cx(globalStyles, "section-label")}>Carrinho de compra</p>
          <h1>Revise seu pedido.</h1>
        </div>
        <Link className={cx(globalStyles, "button button-secondary")} href="/">
          Continuar comprando
        </Link>
      </section>

      <section className={cx(globalStyles, "cart-page-layout")}>
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
          addressFeedback={addressFeedback}
          addresses={addresses}
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
          isAddingAddress={isAddingAddress}
          isAuthenticated={Boolean(resolvedUser)}
          isSavingAddress={isSavingAddress}
          isSubmittingCheckout={checkout.isSubmittingCheckout}
          isSupabaseConfigured={isSupabaseConfigured}
          isValidatingCoupon={coupon.isValidatingCoupon}
          newAddress={newAddress}
          onApplyCoupon={coupon.applyCoupon}
          onCouponCodeChange={coupon.updateCouponCode}
          onCustomerChange={updateCustomer}
          onDataConsentChange={setHasDataConsent}
          onNewAddressCepLookup={lookupNewAddressCep}
          onNewAddressChange={updateNewAddress}
          onPaymentMethodChange={setPaymentMethodId}
          onSaveNewAddress={saveNewAddress}
          onSelectAddress={selectAddress}
          onShippingOptionChange={setShippingOptionId}
          onSubmitCheckout={checkout.submitCheckout}
          onToggleAddAddress={() => setIsAddingAddress((value) => !value)}
          onToggleNotes={() => setShowNotes((value) => !value)}
          onUpdateCep={cep.updateCep}
          paymentMethodId={paymentMethodId}
          selectedAddressId={selectedAddressId}
          shippingOptionId={shippingOptionId}
          showNotes={showNotes}
          totals={checkout.totals}
          whatsappMessage={checkout.whatsappMessage}
        />
      </section>
    </>
  );
}
