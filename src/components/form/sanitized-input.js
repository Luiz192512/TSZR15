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

export function SanitizedInput({ sanitizer, onChange, onInput, ...props }) {
  function sanitizeCurrentValue(event) {
    const sanitize = sanitizers[sanitizer];

    if (sanitize) {
      const sanitizedValue = sanitize(event.currentTarget.value);

      if (event.currentTarget.value !== sanitizedValue) {
        event.currentTarget.value = sanitizedValue;
      }
    }
  }

  function handleChange(event) {
    sanitizeCurrentValue(event);
    onChange?.(event);
  }

  function handleInput(event) {
    sanitizeCurrentValue(event);

    onInput?.(event);
  }

  return <input {...props} onChange={handleChange} onInput={handleInput} />;
}
