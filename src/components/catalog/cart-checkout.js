"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { ASSISTED_PURCHASE_CONSENT_TEXT, buildAddressLine } from "@/src/customer/customer-data.js";
import { fetchCepAddress, formatCepAddressLine, getCepDigits } from "@/src/customer/cep-lookup.js";
import {
  cepPattern,
  phonePattern,
  sanitizeCep,
  sanitizePhone,
  sanitizeTaxId,
  taxIdPattern,
  validateCustomerFieldFormats
} from "@/src/customer/field-validation.js";
import {
  buildWhatsAppOrderMessage,
  calculateCartTotals,
  formatCurrency,
  paymentMethods,
  shippingOptions
} from "@/src/checkout/whatsapp.js";
import {
  removeCartItem,
  sanitizeCartItems,
  updateCartItemQuantity,
  updateCartItemVariation
} from "@/src/cart/cart-items.js";
import {
  clearStoredCart,
  getInitialCustomer,
  readStoredCart,
  StoreHeader,
  storeName,
  writeStoredCart
} from "./catalog-shared.js";
import { createBrowserSupabaseClient } from "@/src/lib/supabase/client.js";

export function CartCheckout({ currentUser, initialCustomer, isSupabaseConfigured, products }) {
  const [cartItems, setCartItems] = useState([]);
  const [hasLoadedCart, setHasLoadedCart] = useState(false);
  const [paymentMethodId, setPaymentMethodId] = useState("pix");
  const [shippingOptionId, setShippingOptionId] = useState("combinar");
  const [hasDataConsent, setHasDataConsent] = useState(Boolean(currentUser));
  const [checkoutFeedback, setCheckoutFeedback] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [couponFeedback, setCouponFeedback] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [cepLookup, setCepLookup] = useState({ message: "", status: "idle" });
  const [cepWasEdited, setCepWasEdited] = useState(false);
  const [autoFilledAddressLine, setAutoFilledAddressLine] = useState("");
  const [isValidatingCoupon, setIsValidatingCoupon] = useState(false);
  const [isSubmittingCheckout, setIsSubmittingCheckout] = useState(false);
  const [customer, setCustomer] = useState(() => getInitialCustomer(initialCustomer));
  const [resolvedUser, setResolvedUser] = useState(currentUser ?? null);
  const initialCustomerHadAddress = useRef(Boolean(initialCustomer?.address));
  const isAuthenticated = Boolean(resolvedUser);
  const productsById = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products]
  );

  useEffect(() => {
    const sanitizedItems = sanitizeCartItems(readStoredCart(), products);
    setCartItems(sanitizedItems);
    setHasLoadedCart(true);
    writeStoredCart(sanitizedItems);
  }, [products]);

  useEffect(() => {
    if (currentUser) {
      setResolvedUser(currentUser);
      setHasDataConsent(true);
      return undefined;
    }

    const supabase = createBrowserSupabaseClient();

    if (!supabase) {
      return undefined;
    }

    let isMounted = true;

    async function loadCustomerData() {
      try {
        const {
          data: { user }
        } = await supabase.auth.getUser();

        if (!isMounted || !user) {
          return;
        }

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

        if (!isMounted) {
          return;
        }

        const addressLine = buildAddressLine(address);

        if (addressLine) {
          initialCustomerHadAddress.current = true;
        }

        setCustomer((currentCustomer) => ({
          ...currentCustomer,
          address: currentCustomer.address || addressLine,
          cep: currentCustomer.cep || address?.cep || "",
          email: currentCustomer.email || profile?.email || user.email || "",
          name: currentCustomer.name || profile?.full_name || "",
          phone: currentCustomer.phone || profile?.phone || "",
          taxId: currentCustomer.taxId || profile?.tax_id || "",
          whatsapp: currentCustomer.whatsapp || profile?.whatsapp || ""
        }));
      } catch {
        if (isMounted) {
          setResolvedUser(null);
        }
      }
    }

    loadCustomerData();

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setResolvedUser(session?.user ?? null);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [currentUser]);

  useEffect(() => {
    if (hasLoadedCart) {
      writeStoredCart(cartItems);
    }
  }, [cartItems, hasLoadedCart]);

  useEffect(() => {
    if (appliedCoupon) {
      setAppliedCoupon(null);
      setCouponFeedback("Carrinho alterado. Aplique o cupom novamente.");
    }
  }, [cartItems]);

  useEffect(() => {
    const cepDigits = getCepDigits(customer.cep);

    if (cepDigits.length !== 8) {
      setCepLookup({ message: "", status: "idle" });
      return;
    }

    if (!cepWasEdited && initialCustomerHadAddress.current) {
      return;
    }

    const controller = new AbortController();

    setCepLookup({ message: "Buscando endereco pelo CEP...", status: "loading" });

    fetchCepAddress(customer.cep, { signal: controller.signal })
      .then((address) => {
        if (!address) {
          setAutoFilledAddressLine("");
          setCepLookup({
            message: "CEP nao encontrado. Confira o numero ou preencha o endereco manualmente.",
            status: "error"
          });
          return;
        }

        const addressLine = formatCepAddressLine(address);

        setCustomer((currentCustomer) => {
          if (getCepDigits(currentCustomer.cep) !== cepDigits) {
            return currentCustomer;
          }

          return {
            ...currentCustomer,
            address: addressLine || currentCustomer.address
          };
        });
        setAutoFilledAddressLine(addressLine);
        setCepLookup({
          message: "Endereco preenchido pelo CEP. Complete com numero e complemento.",
          status: "success"
        });
      })
      .catch((error) => {
        if (error?.name === "AbortError") {
          return;
        }

        setAutoFilledAddressLine("");
        setCepLookup({
          message: "Nao foi possivel consultar o CEP agora. Preencha o endereco manualmente.",
          status: "error"
        });
      });

    return () => controller.abort();
  }, [cepWasEdited, customer.cep]);

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
  const hasCartItems = cartItems.length > 0;
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
    [appliedCoupon, cartItems, customer, paymentMethodId, shippingOptionId]
  );

  function updateQuantity(cartKey, nextQuantity) {
    setCartItems((currentItems) => updateCartItemQuantity(currentItems, cartKey, nextQuantity));
  }

  function updateVariation(cartKey, nextVariation) {
    setCartItems((currentItems) =>
      updateCartItemVariation(currentItems, products, cartKey, nextVariation)
    );
  }

  function deleteItem(cartKey) {
    setCartItems((currentItems) => removeCartItem(currentItems, cartKey));
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
        body: JSON.stringify({
          cartItems,
          couponCode: normalizedCode,
          shippingOptionId
        }),
        headers: {
          "Content-Type": "application/json"
        },
        method: "POST"
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Cupom invalido.");
      }

      setAppliedCoupon(data.coupon);
      setCouponFeedback(`Cupom ${data.coupon.code} aplicado.`);
    } catch (error) {
      setAppliedCoupon(null);
      setCouponFeedback(error instanceof Error ? error.message : "Cupom invalido.");
    } finally {
      setIsValidatingCoupon(false);
    }
  }

  function updateCustomer(field, value) {
    setCustomer((currentCustomer) => ({
      ...currentCustomer,
      [field]: value
    }));
  }

  function updateCep(value) {
    const cep = sanitizeCep(value);

    setCepWasEdited(true);
    setCustomer((currentCustomer) => {
      const shouldClearAddress =
        autoFilledAddressLine && currentCustomer.address.trim() === autoFilledAddressLine.trim();

      return {
        ...currentCustomer,
        address: shouldClearAddress ? "" : currentCustomer.address,
        cep
      };
    });
    setAutoFilledAddressLine("");
  }

  async function submitCheckout() {
    if (!canCheckout || isSubmittingCheckout) {
      if (customerFieldErrors.length > 0) {
        setCheckoutFeedback(customerFieldErrors[0]);
      }

      return;
    }

    setCheckoutFeedback("");
    setIsSubmittingCheckout(true);

    try {
      const response = await fetch("/api/checkout/whatsapp", {
        body: JSON.stringify({
          cartItems,
          customer,
          couponCode: appliedCoupon?.code ?? "",
          hasDataConsent,
          paymentMethodId,
          shippingOptionId
        }),
        headers: {
          "Content-Type": "application/json"
        },
        method: "POST"
      });
      const data = await response.json();

      if (!response.ok) {
        const details = Array.isArray(data.details) ? data.details.join(" ") : "";
        throw new Error([data.error, details].filter(Boolean).join(" "));
      }

      if (!data.whatsappUrl) {
        throw new Error("Numero do WhatsApp Business nao configurado.");
      }

      if (data.order?.saved && data.order?.orderNumber) {
        setCheckoutFeedback(`Pedido ${data.order.orderNumber} salvo. Abrindo WhatsApp.`);
      } else if (data.order?.reason) {
        setCheckoutFeedback(`Mensagem pronta. ${data.order.reason}`);
      } else {
        setCheckoutFeedback("Mensagem pronta. Abrindo WhatsApp.");
      }

      clearStoredCart();
      setCartItems([]);
      window.open(data.whatsappUrl, "_blank", "noopener,noreferrer");
    } catch (error) {
      setCheckoutFeedback(
        error instanceof Error ? error.message : "Nao foi possivel finalizar o pedido agora."
      );
    } finally {
      setIsSubmittingCheckout(false);
    }
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
        <div className="cart-items-panel">
          <div className="panel-heading">
            <h2>Itens no carrinho</h2>
            <strong>{formatCurrency(totals.subtotalCents)}</strong>
          </div>

          {!hasLoadedCart ? (
            <div className="inline-loader-panel">
              <span aria-hidden="true" className="button-loader" />
              <p className="empty-copy">Carregando carrinho...</p>
            </div>
          ) : cartItems.length === 0 ? (
            <div className="empty-cart">
              <p>Seu carrinho ainda está vazio.</p>
              <Link className="button button-primary" href="/">
                Ver produtos
              </Link>
            </div>
          ) : (
            <div className="cart-line-list">
              {cartItems.map((item) => {
                const product = productsById.get(item.id);
                const canChangeVariation = product?.variations?.length > 1;

                return (
                  <article className="cart-line" key={item.cartKey}>
                    <div className={`cart-line-image family-${item.productFamily}`}>
                      {item.name
                        .split(/\s+/)
                        .slice(0, 2)
                        .map((part) => part[0])
                        .join("")
                        .toUpperCase()}
                    </div>
                    <div className="cart-line-detail">
                      <strong>{item.name}</strong>
                      {canChangeVariation ? (
                        <label className="cart-line-variation">
                          <span>Variacao</span>
                          <select
                            onChange={(event) => updateVariation(item.cartKey, event.target.value)}
                            value={item.variation}
                          >
                            {product.variations.map((variation) => (
                              <option key={variation} value={variation}>
                                {variation}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : (
                        <span>{item.variation}</span>
                      )}
                    </div>
                    <div className="cart-line-controls">
                      <div className="quantity-control" aria-label={`Quantidade de ${item.name}`}>
                        <button
                          aria-label={`Remover uma unidade de ${item.name}`}
                          onClick={() => updateQuantity(item.cartKey, item.quantity - 1)}
                          type="button"
                        >
                          -
                        </button>
                        <span>{item.quantity}</span>
                        <button
                          aria-label={`Adicionar uma unidade de ${item.name}`}
                          onClick={() => updateQuantity(item.cartKey, item.quantity + 1)}
                          type="button"
                        >
                          +
                        </button>
                      </div>
                      <button
                        aria-label={`Excluir ${item.name} do carrinho`}
                        className="cart-line-delete"
                        onClick={() => deleteItem(item.cartKey)}
                        type="button"
                      >
                        Excluir
                      </button>
                    </div>
                    <strong>{formatCurrency(item.priceCents * item.quantity)}</strong>
                  </article>
                );
              })}
            </div>
          )}
        </div>

        <aside className="cart-summary-panel">
          <div className="checkout-header">
            <p className="section-label">Resumo do pedido</p>
            <h2>{formatCurrency(totals.totalCents)}</h2>
          </div>

          {!hasCartItems ? (
            <div className="cart-summary-empty">
              <strong>Seu carrinho está vazio.</strong>
              <span>Escolha um produto para liberar dados de entrega, cupom e WhatsApp.</span>
              <Link className="button button-primary" href="/catalogo#produtos">
                Ver produtos
              </Link>
            </div>
          ) : (
            <>
              {!isAuthenticated ? (
                <div className="account-nudge">
                  <strong>Compre mais rapido</strong>
                  <span>Crie conta para salvar dados de entrega e preencher o checkout.</span>
                  <Link href={isSupabaseConfigured ? "/cadastrar" : "/conta"}>
                    Cadastrar cliente
                  </Link>
                </div>
              ) : (
                <div className="account-nudge is-signed">
                  <strong>Dados da sua conta carregados</strong>
                  <span>Você pode editar qualquer campo antes de enviar ao atendimento.</span>
                </div>
              )}

              <div className="checkout-form">
                <label>
                  <span>
                    Nome{" "}
                    <span className="required-field-mark" aria-hidden="true">
                      *
                    </span>
                  </span>
                  <input
                    onChange={(event) => updateCustomer("name", event.target.value)}
                    placeholder="Nome do cliente"
                    required
                    value={customer.name}
                  />
                </label>
                <label>
                  <span>CPF/CNPJ</span>
                  <input
                    inputMode="numeric"
                    onChange={(event) => updateCustomer("taxId", sanitizeTaxId(event.target.value))}
                    pattern={taxIdPattern}
                    placeholder="Opcional quando nao exigido"
                    title="Use somente numeros, pontos, barra e hifen."
                    value={customer.taxId}
                  />
                </label>
                <label>
                  <span>Email</span>
                  <input
                    onChange={(event) => updateCustomer("email", event.target.value)}
                    placeholder="voce@email.com"
                    type="email"
                    value={customer.email}
                  />
                </label>
                <label>
                  <span>
                    WhatsApp ou telefone{" "}
                    <span className="required-field-mark" aria-hidden="true">
                      *
                    </span>
                  </span>
                  <input
                    aria-required="true"
                    inputMode="tel"
                    onChange={(event) =>
                      updateCustomer("whatsapp", sanitizePhone(event.target.value))
                    }
                    pattern={phonePattern}
                    placeholder="(00) 00000-0000"
                    title="Use somente números e pontuação de telefone."
                    value={customer.whatsapp}
                  />
                </label>
                <label>
                  <span>Telefone opcional</span>
                  <input
                    inputMode="tel"
                    onChange={(event) => updateCustomer("phone", sanitizePhone(event.target.value))}
                    pattern={phonePattern}
                    placeholder="Telefone alternativo"
                    title="Use somente números e pontuação de telefone."
                    value={customer.phone}
                  />
                </label>
                <label>
                  <span>
                    CEP{" "}
                    <span className="required-field-mark" aria-hidden="true">
                      *
                    </span>
                  </span>
                  <input
                    inputMode="numeric"
                    onChange={(event) => updateCep(event.target.value)}
                    pattern={cepPattern}
                    placeholder="00000-000"
                    required
                    title="Use 8 numeros, com ou sem hifen."
                    value={customer.cep}
                  />
                </label>
                {cepLookup.message ? (
                  <p
                    aria-live="polite"
                    className="checkout-note span-all"
                    role={cepLookup.status === "error" ? "alert" : "status"}
                  >
                    {cepLookup.message}
                  </p>
                ) : null}
                <label className="span-all">
                  <span>
                    Endereço completo{" "}
                    <span className="required-field-mark" aria-hidden="true">
                      *
                    </span>
                  </span>
                  <input
                    onChange={(event) => updateCustomer("address", event.target.value)}
                    placeholder="Rua, numero, bairro, cidade/UF"
                    required
                    value={customer.address}
                  />
                </label>
                <label>
                  <span>Pagamento</span>
                  <select
                    onChange={(event) => setPaymentMethodId(event.target.value)}
                    value={paymentMethodId}
                  >
                    {paymentMethods.map((paymentMethod) => (
                      <option key={paymentMethod.id} value={paymentMethod.id}>
                        {paymentMethod.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Frete</span>
                  <select
                    onChange={(event) => setShippingOptionId(event.target.value)}
                    value={shippingOptionId}
                  >
                    {shippingOptions.map((shippingOption) => (
                      <option key={shippingOption.id} value={shippingOption.id}>
                        {shippingOption.label} - {formatCurrency(shippingOption.priceCents)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="span-all">
                  <span>Observacoes</span>
                  <textarea
                    onChange={(event) => updateCustomer("notes", event.target.value)}
                    placeholder="Cor, urgência, dúvida ou combinação especial"
                    value={customer.notes}
                  />
                </label>
                <label className="consent-box span-all">
                  <input
                    checked={hasDataConsent}
                    onChange={(event) => setHasDataConsent(event.target.checked)}
                    required
                    type="checkbox"
                  />
                  <span>
                    {ASSISTED_PURCHASE_CONSENT_TEXT}{" "}
                    <span className="required-field-mark" aria-hidden="true">
                      *
                    </span>
                  </span>
                </label>
              </div>

              <div className="total-box">
                <span>Subtotal</span>
                <strong>{formatCurrency(totals.subtotalCents)}</strong>
                <span>Desconto</span>
                <strong>{formatCurrency(totals.discountCents)}</strong>
                <span>Frete</span>
                <strong>{formatCurrency(totals.shippingCents)}</strong>
                <span>Total</span>
                <strong>{formatCurrency(totals.totalCents)}</strong>
              </div>

              <div className="coupon-box">
                <label>
                  <span>Cupom de desconto</span>
                  <input
                    onChange={(event) => {
                      setCouponCode(event.target.value);
                      if (appliedCoupon) {
                        setAppliedCoupon(null);
                      }
                    }}
                    placeholder="R15OFF"
                    value={couponCode}
                  />
                </label>
                <button
                  aria-label="Aplicar cupom de desconto"
                  className="button button-secondary"
                  disabled={isValidatingCoupon || cartItems.length === 0}
                  onClick={applyCoupon}
                  type="button"
                >
                  {isValidatingCoupon ? (
                    <>
                      <span aria-hidden="true" className="button-loader" />
                      Validando...
                    </>
                  ) : (
                    "Aplicar cupom"
                  )}
                </button>
                {couponFeedback ? (
                  <p className="checkout-note" aria-live="polite" role="status">
                    {couponFeedback}
                  </p>
                ) : null}
              </div>

              <textarea className="message-preview" readOnly value={whatsappMessage} />

              <p className="checkout-note" aria-live="polite">
                {hasAutoFilledAddressPendingEdit
                  ? "Complete o endereco com numero antes de enviar."
                  : !hasRequiredCustomerData
                    ? "Preencha nome, WhatsApp, CEP e endereço para enviar."
                    : customerFieldErrors.length > 0
                      ? customerFieldErrors[0]
                      : hasDataConsent
                        ? "Pedido pronto para enviar ao atendimento."
                        : "Confirme o aceite de dados para liberar o envio."}
              </p>

              {checkoutFeedback ? (
                <p className="checkout-note" aria-live="polite" role="status">
                  {checkoutFeedback}
                </p>
              ) : null}

              <button
                aria-label="Enviar pedido no WhatsApp"
                className={`button button-success checkout-button ${
                  !canCheckout || isSubmittingCheckout ? "is-disabled" : ""
                }`}
                disabled={!canCheckout || isSubmittingCheckout}
                onClick={submitCheckout}
                type="button"
              >
                {isSubmittingCheckout ? (
                  <>
                    <span aria-hidden="true" className="button-loader" />
                    Salvando pedido...
                  </>
                ) : (
                  "Enviar pedido no WhatsApp"
                )}
              </button>
            </>
          )}
        </aside>
      </section>
    </>
  );
}
