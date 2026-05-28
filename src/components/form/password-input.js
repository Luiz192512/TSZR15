"use client";

import { useId, useState } from "react";

export function PasswordInput({
  className,
  hideLabel = "Ocultar senha",
  label = "Senha",
  showLabel = "Mostrar senha",
  ...props
}) {
  const generatedId = useId();
  const inputId = props.id ?? generatedId;
  const [isVisible, setIsVisible] = useState(false);

  return (
    <label className={className} htmlFor={inputId}>
      <span>{label}</span>
      <span className="password-input-shell">
        <input {...props} id={inputId} type={isVisible ? "text" : "password"} />
        <button
          aria-label={isVisible ? hideLabel : showLabel}
          aria-pressed={isVisible}
          className="password-toggle"
          onClick={() => setIsVisible((current) => !current)}
          type="button"
        >
          {isVisible ? "Ocultar" : "Mostrar"}
        </button>
      </span>
    </label>
  );
}
