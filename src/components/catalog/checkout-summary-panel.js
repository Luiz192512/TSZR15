"use client";

import globalStyles from "@/app/storefront.module.css";
import { cx } from "@/src/lib/classnames";
import Link from "next/link";

import { ASSISTED_PURCHASE_CONSENT_TEXT, buildAddressLine } from "@/src/customer/customer-data.js";
import {
  cepPattern,
  phonePattern,
  sanitizeCep,
  sanitizePhone,
  sanitizeState,
  sanitizeTaxId,
  taxIdPattern
} from "@/src/customer/field-validation.js";
import { formatCurrency, paymentMethods, shippingOptions } from "@/src/checkout/whatsapp.js";

function PaymentAndShipping({ onPaymentMethodChange, onShippingOptionChange, paymentMethodId, shippingOptionId }) {
  return (
    <div className={cx(globalStyles, "checkout-form checkout-delivery-grid")}>
      <label>
        <span>Pagamento</span>
        <select onChange={(event) => onPaymentMethodChange(event.target.value)} value={paymentMethodId}>
          {paymentMethods.map((paymentMethod) => (
            <option key={paymentMethod.id} value={paymentMethod.id}>
              {paymentMethod.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>Frete</span>
        <select onChange={(event) => onShippingOptionChange(event.target.value)} value={shippingOptionId}>
          {shippingOptions.map((shippingOption) => (
            <option key={shippingOption.id} value={shippingOption.id}>
              {shippingOption.label} - {formatCurrency(shippingOption.priceCents)}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

function NewAddressForm({ isSavingAddress, newAddress, onNewAddressCepLookup, onNewAddressChange, onSaveNewAddress }) {
  return (
    <div className={cx(globalStyles, "address-card address-new-form")}>
      <div className={cx(globalStyles, "address-new-grid")}>
        <label className={cx(globalStyles, "span-all")}>
          <span>Apelido</span>
          <input
            onChange={(event) => onNewAddressChange("label", event.target.value)}
            placeholder="Casa, trabalho..."
            value={newAddress.label}
          />
        </label>
        <label>
          <span>CEP *</span>
          <input
            inputMode="numeric"
            onBlur={(event) => onNewAddressCepLookup(event.target.value)}
            onChange={(event) => onNewAddressChange("cep", sanitizeCep(event.target.value))}
            pattern={cepPattern}
            placeholder="00000-000"
            value={newAddress.cep}
          />
        </label>
        <label>
          <span>Número *</span>
          <input
            onChange={(event) => onNewAddressChange("number", event.target.value)}
            placeholder="Nº"
            value={newAddress.number}
          />
        </label>
        <label className={cx(globalStyles, "span-all")}>
          <span>Rua *</span>
          <input
            onChange={(event) => onNewAddressChange("street", event.target.value)}
            placeholder="Rua / avenida"
            value={newAddress.street}
          />
        </label>
        <label>
          <span>Bairro *</span>
          <input
            onChange={(event) => onNewAddressChange("district", event.target.value)}
            placeholder="Bairro"
            value={newAddress.district}
          />
        </label>
        <label>
          <span>Cidade *</span>
          <input
            onChange={(event) => onNewAddressChange("city", event.target.value)}
            placeholder="Cidade"
            value={newAddress.city}
          />
        </label>
        <label>
          <span>UF *</span>
          <input
            onChange={(event) => onNewAddressChange("state", sanitizeState(event.target.value))}
            placeholder="UF"
            value={newAddress.state}
          />
        </label>
        <label>
          <span>Complemento</span>
          <input
            onChange={(event) => onNewAddressChange("complement", event.target.value)}
            placeholder="Apto, bloco..."
            value={newAddress.complement}
          />
        </label>
      </div>
      <button
        className={cx(globalStyles, "button button-secondary")}
        disabled={isSavingAddress}
        onClick={onSaveNewAddress}
        type="button"
      >
        {isSavingAddress ? "Salvando..." : "Salvar endereço"}
      </button>
    </div>
  );
}

function LoggedInDelivery({
  addressFeedback,
  addresses,
  customer,
  isAddingAddress,
  isSavingAddress,
  newAddress,
  onCustomerChange,
  onNewAddressCepLookup,
  onNewAddressChange,
  onPaymentMethodChange,
  onSaveNewAddress,
  onSelectAddress,
  onShippingOptionChange,
  onToggleAddAddress,
  onToggleNotes,
  paymentMethodId,
  selectedAddressId,
  shippingOptionId,
  showNotes
}) {
  return (
    <div className={cx(globalStyles, "checkout-logged")}>
      <div className={cx(globalStyles, "checkout-identity")}>
        <div>
          <span>Comprando como</span>
          <strong>{customer.name || "Cliente"}</strong>
          <small>{[customer.whatsapp, customer.email].filter(Boolean).join(" · ") || "Conta TSZR15"}</small>
        </div>
        <Link className={cx(globalStyles, "checkout-edit-link")} href="/conta?tab=dados">
          Editar dados
        </Link>
      </div>

      <div className={cx(globalStyles, "checkout-section")}>
        <p className={cx(globalStyles, "checkout-section-title")}>Endereço de entrega</p>
        <div className={cx(globalStyles, "address-card-list")}>
          {addresses.map((address) => (
            <button
              aria-pressed={address.id === selectedAddressId}
              className={cx(
                globalStyles,
                `address-card ${address.id === selectedAddressId ? "is-selected" : ""}`
              )}
              key={address.id}
              onClick={() => onSelectAddress(address.id)}
              type="button"
            >
              <span aria-hidden="true" className={cx(globalStyles, "address-card-radio")} />
              <span className={cx(globalStyles, "address-card-body")}>
                <strong>
                  {address.label || "Endereço"}
                  {address.is_default ? " · Padrão" : ""}
                </strong>
                <span>{buildAddressLine(address)}</span>
              </span>
            </button>
          ))}

          {isAddingAddress ? (
            <NewAddressForm
              isSavingAddress={isSavingAddress}
              newAddress={newAddress}
              onNewAddressCepLookup={onNewAddressCepLookup}
              onNewAddressChange={onNewAddressChange}
              onSaveNewAddress={onSaveNewAddress}
            />
          ) : (
            <button
              className={cx(globalStyles, "address-card address-add-card")}
              onClick={onToggleAddAddress}
              type="button"
            >
              + Adicionar novo endereço
            </button>
          )}

          {isAddingAddress && addresses.length > 0 ? (
            <button
              className={cx(globalStyles, "checkout-add-note")}
              onClick={onToggleAddAddress}
              type="button"
            >
              Cancelar novo endereço
            </button>
          ) : null}

          {addressFeedback ? (
            <p className={cx(globalStyles, "checkout-note")} aria-live="polite" role="status">
              {addressFeedback}
            </p>
          ) : null}
        </div>
      </div>

      <div className={cx(globalStyles, "checkout-section")}>
        {showNotes ? (
          <label className={cx(globalStyles, "checkout-notes-field")}>
            <span>Observações</span>
            <textarea
              onChange={(event) => onCustomerChange("notes", event.target.value)}
              placeholder="Cor, urgência, dúvida ou combinação especial"
              value={customer.notes}
            />
          </label>
        ) : (
          <button
            className={cx(globalStyles, "checkout-add-note")}
            onClick={onToggleNotes}
            type="button"
          >
            + Adicionar observação
          </button>
        )}
      </div>

      <PaymentAndShipping
        onPaymentMethodChange={onPaymentMethodChange}
        onShippingOptionChange={onShippingOptionChange}
        paymentMethodId={paymentMethodId}
        shippingOptionId={shippingOptionId}
      />
    </div>
  );
}

export function CheckoutSummaryPanel({
  addressFeedback,
  addresses,
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
  isAddingAddress,
  isAuthenticated,
  isSavingAddress,
  isSubmittingCheckout,
  isSupabaseConfigured,
  isValidatingCoupon,
  newAddress,
  onApplyCoupon,
  onCouponCodeChange,
  onCustomerChange,
  onDataConsentChange,
  onNewAddressCepLookup,
  onNewAddressChange,
  onPaymentMethodChange,
  onSaveNewAddress,
  onSelectAddress,
  onShippingOptionChange,
  onSubmitCheckout,
  onToggleAddAddress,
  onToggleNotes,
  onUpdateCep,
  paymentMethodId,
  selectedAddressId,
  shippingOptionId,
  showNotes,
  totals,
  whatsappMessage
}) {
  return (
    <aside className={cx(globalStyles, "cart-summary-panel")}>
      <div className={cx(globalStyles, "checkout-header")}>
        <p className={cx(globalStyles, "section-label")}>Resumo do pedido</p>
        <h2>{formatCurrency(totals.totalCents)}</h2>
      </div>

      {cartItems.length === 0 ? (
        <div className={cx(globalStyles, "cart-summary-empty")}>
          <strong>Seu carrinho está vazio.</strong>
          <span>Escolha um produto para liberar dados de entrega, cupom e WhatsApp.</span>
          <Link className={cx(globalStyles, "button button-primary")} href="/catalogo#produtos">
            Ver produtos
          </Link>
        </div>
      ) : (
        <>
          {!isAuthenticated ? (
            <div className={cx(globalStyles, "account-nudge")}>
              <strong>Compre mais rápido</strong>
              <span>Crie conta para salvar dados de entrega e preencher o checkout.</span>
              <Link href={isSupabaseConfigured ? "/cadastrar" : "/conta"}>Cadastrar cliente</Link>
            </div>
          ) : null}

          {isAuthenticated ? (
            <LoggedInDelivery
              addressFeedback={addressFeedback}
              addresses={addresses}
              customer={customer}
              isAddingAddress={isAddingAddress}
              isSavingAddress={isSavingAddress}
              newAddress={newAddress}
              onCustomerChange={onCustomerChange}
              onNewAddressCepLookup={onNewAddressCepLookup}
              onNewAddressChange={onNewAddressChange}
              onPaymentMethodChange={onPaymentMethodChange}
              onSaveNewAddress={onSaveNewAddress}
              onSelectAddress={onSelectAddress}
              onShippingOptionChange={onShippingOptionChange}
              onToggleAddAddress={onToggleAddAddress}
              onToggleNotes={onToggleNotes}
              paymentMethodId={paymentMethodId}
              selectedAddressId={selectedAddressId}
              shippingOptionId={shippingOptionId}
              showNotes={showNotes}
            />
          ) : (
            <div className={cx(globalStyles, "checkout-form")}>
              <label>
                <span>
                  Nome{" "}
                  <span className={cx(globalStyles, "required-field-mark")} aria-hidden="true">
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
                  <span className={cx(globalStyles, "required-field-mark")} aria-hidden="true">
                    *
                  </span>
                </span>
                <input
                  aria-required="true"
                  inputMode="tel"
                  onChange={(event) => onCustomerChange("whatsapp", sanitizePhone(event.target.value))}
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
                  <span className={cx(globalStyles, "required-field-mark")} aria-hidden="true">
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
                  className={cx(globalStyles, "checkout-note span-all")}
                  role={cepLookup.status === "error" ? "alert" : "status"}
                >
                  {cepLookup.message}
                </p>
              ) : null}
              <label className={cx(globalStyles, "span-all")}>
                <span>
                  Endereço completo{" "}
                  <span className={cx(globalStyles, "required-field-mark")} aria-hidden="true">
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
                <select onChange={(event) => onPaymentMethodChange(event.target.value)} value={paymentMethodId}>
                  {paymentMethods.map((paymentMethod) => (
                    <option key={paymentMethod.id} value={paymentMethod.id}>
                      {paymentMethod.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Frete</span>
                <select onChange={(event) => onShippingOptionChange(event.target.value)} value={shippingOptionId}>
                  {shippingOptions.map((shippingOption) => (
                    <option key={shippingOption.id} value={shippingOption.id}>
                      {shippingOption.label} - {formatCurrency(shippingOption.priceCents)}
                    </option>
                  ))}
                </select>
              </label>
              <label className={cx(globalStyles, "span-all")}>
                <span>Observações</span>
                <textarea
                  onChange={(event) => onCustomerChange("notes", event.target.value)}
                  placeholder="Cor, urgência, dúvida ou combinação especial"
                  value={customer.notes}
                />
              </label>
              <label className={cx(globalStyles, "consent-box span-all")}>
                <input
                  checked={hasDataConsent}
                  onChange={(event) => onDataConsentChange(event.target.checked)}
                  required
                  type="checkbox"
                />
                <span>
                  {ASSISTED_PURCHASE_CONSENT_TEXT}{" "}
                  <span className={cx(globalStyles, "required-field-mark")} aria-hidden="true">
                    *
                  </span>
                </span>
              </label>
            </div>
          )}

          <div className={cx(globalStyles, "total-box")}>
            <span>Subtotal</span>
            <strong>{formatCurrency(totals.subtotalCents)}</strong>
            <span>Desconto</span>
            <strong>{formatCurrency(totals.discountCents)}</strong>
            <span>Frete</span>
            <strong>{formatCurrency(totals.shippingCents)}</strong>
            <span>Total</span>
            <strong>{formatCurrency(totals.totalCents)}</strong>
          </div>

          <div className={cx(globalStyles, "coupon-box")}>
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
              className={cx(globalStyles, "button button-secondary")}
              disabled={isValidatingCoupon || cartItems.length === 0}
              onClick={onApplyCoupon}
              type="button"
            >
              {isValidatingCoupon ? (
                <>
                  <span aria-hidden="true" className={cx(globalStyles, "button-loader")} />
                  Validando...
                </>
              ) : (
                "Aplicar cupom"
              )}
            </button>
            {couponFeedback ? (
              <p className={cx(globalStyles, "checkout-note")} aria-live="polite" role="status">
                {couponFeedback}
              </p>
            ) : null}
          </div>

          <textarea
            className={cx(globalStyles, "message-preview")}
            readOnly
            value={whatsappMessage}
          />
          <p className={cx(globalStyles, "checkout-note")} aria-live="polite">
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
            <p className={cx(globalStyles, "checkout-note")} aria-live="polite" role="status">
              {checkoutFeedback}
            </p>
          ) : null}
          <button
            aria-label="Enviar pedido no WhatsApp"
            className={cx(
              globalStyles,
              `button button-success checkout-button ${!canCheckout || isSubmittingCheckout ? "is-disabled" : ""}`
            )}
            disabled={!canCheckout || isSubmittingCheckout}
            onClick={onSubmitCheckout}
            type="button"
          >
            {isSubmittingCheckout ? (
              <>
                <span aria-hidden="true" className={cx(globalStyles, "button-loader")} />
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
