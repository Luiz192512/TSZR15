"use client";

import globalStyles from "@/src/styles/storefront-styles.js";
import { cx } from "@/src/lib/classnames";

import { PendingSubmitButton } from "@/src/components/form/pending-submit-button.js";

export function TrackingLookupForm({ contact = "", orderNumber = "" }) {
  return (
    <form className={cx(globalStyles, "auth-card tracking-lookup-card")} method="GET">
      <p className={cx(globalStyles, "section-label")}>Rastreio TSZR15</p>
      <h1>Acompanhe seu pedido.</h1>
      <p className={cx(globalStyles, "helper-text")}>
        Use o número gerado no checkout e o WhatsApp da compra.
      </p>

      <label>
        <span>Número do pedido</span>
        <input defaultValue={orderNumber} name="pedido" placeholder="TSZ-..." required />
      </label>

      <label>
        <span>WhatsApp ou CPF/CNPJ</span>
        <input defaultValue={contact} name="contato" required />
      </label>

      <PendingSubmitButton pendingLabel="Consultando...">Consultar rastreio</PendingSubmitButton>
    </form>
  );
}
