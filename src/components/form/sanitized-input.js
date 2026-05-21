"use client";

import {
  sanitizeCep,
  sanitizePhone,
  sanitizeState,
  sanitizeTaxId
} from "@/src/customer/field-validation.js";

const sanitizers = {
  cep: sanitizeCep,
  phone: sanitizePhone,
  state: sanitizeState,
  taxId: sanitizeTaxId
};

export function SanitizedInput({ sanitizer, onInput, ...props }) {
  function handleInput(event) {
    const sanitize = sanitizers[sanitizer];

    if (sanitize) {
      const sanitizedValue = sanitize(event.currentTarget.value);

      if (event.currentTarget.value !== sanitizedValue) {
        event.currentTarget.value = sanitizedValue;
      }
    }

    onInput?.(event);
  }

  return <input {...props} onInput={handleInput} />;
}
