"use client";

import Link from "next/link";

import { ASSISTED_PURCHASE_CONSENT_TEXT } from "@/src/customer/customer-data.js";
import {
  cepPattern,
  phonePattern,
  sanitizePhone,
  sanitizeTaxId,
  taxIdPattern
} from "@/src/customer/field-validation.js";
import { formatCurrency, paymentMethods, shippingOptions } from "@/src/checkout/whatsapp.js";

export function CheckoutSummaryPanel({
  canCheckout,
  cartItems,
  cepLookup,
  checkoutFeedback,
  couponCode,
  couponFeedback,
  customer,
  customerFieldErrors,
  hasAutoFilledAddressPendingEdit,
  hasDataConsent,
  hasRequiredCustomerData,
  isAuthenticated,
  isSubmittingCheckout,
  isSupabaseConfigured,
  isValidatingCoupon,
  onApplyCoupon,
  onCouponCodeChange,
  onCustomerChange,
  onDataConsentChange,
  onPaymentMethodChange,
  onShippingOptionChange,
  onSubmitCheckout,
  onUpdateCep,
  paymentMethodId,
  shippingOptionId,
  totals,
  whatsappMessage
}) {
  return (
    <aside className="cart-summary-panel">
      <div className="checkout-header">
        <p className="section-label">Resumo do pedido</p>
        <h2>{formatCurrency(totals.totalCents)}</h2>
      </div>

      {cartItems.length === 0 ? (
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
              <strong>Compre mais rápido</strong>
              <span>Crie conta para salvar dados de entrega e preencher o checkout.</span>
              <Link href={isSupabaseConfigured ? "/cadastrar" : "/conta"}>Cadastrar cliente</Link>
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
                onChange={(event) => onCustomerChange("name", event.target.value)}
                placeholder="Nome do cliente"
                required
                value={customer.name}
              />
            </label>
            <label>
              <span>CPF/CNPJ</span>
              <input
                inputMode="numeric"
                onChange={(event) => onCustomerChange("taxId", sanitizeTaxId(event.target.value))}
                pattern={taxIdPattern}
                placeholder="Opcional quando não exigido"
                title="Use somente números, pontos, barra e hífen."
                value={customer.taxId}
              />
            </label>
            <label>
              <span>E-mail</span>
              <input
                onChange={(event) => onCustomerChange("email", event.target.value)}
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
                  onCustomerChange("whatsapp", sanitizePhone(event.target.value))
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
                onChange={(event) => onCustomerChange("phone", sanitizePhone(event.target.value))}
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
                onChange={(event) => onUpdateCep(event.target.value)}
                pattern={cepPattern}
                placeholder="00000-000"
                required
                title="Use 8 números, com ou sem hífen."
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
                onChange={(event) => onCustomerChange("address", event.target.value)}
                placeholder="Rua, número, bairro, cidade/UF"
                required
                value={customer.address}
              />
            </label>
            <label>
              <span>Pagamento</span>
              <select
                onChange={(event) => onPaymentMethodChange(event.target.value)}
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
                onChange={(event) => onShippingOptionChange(event.target.value)}
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
              <span>Observações</span>
              <textarea
                onChange={(event) => onCustomerChange("notes", event.target.value)}
                placeholder="Cor, urgência, dúvida ou combinação especial"
                value={customer.notes}
              />
            </label>
            <label className="consent-box span-all">
              <input
                checked={hasDataConsent}
                onChange={(event) => onDataConsentChange(event.target.checked)}
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
                onChange={(event) => onCouponCodeChange(event.target.value)}
                placeholder="R15OFF"
                value={couponCode}
              />
            </label>
            <button
              aria-label="Aplicar cupom de desconto"
              className="button button-secondary"
              disabled={isValidatingCoupon || cartItems.length === 0}
              onClick={onApplyCoupon}
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
              ? "Complete o endereço com número antes de enviar."
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
            className={`button button-success checkout-button ${!canCheckout || isSubmittingCheckout ? "is-disabled" : ""}`}
            disabled={!canCheckout || isSubmittingCheckout}
            onClick={onSubmitCheckout}
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
  );
}
