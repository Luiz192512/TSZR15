"use client";

import globalStyles from "@/src/styles/storefront-styles.js";
import { cx } from "@/src/lib/classnames";
import { useId, useState } from "react";

import styles from "./password-input.module.css";

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
  const labelClassName = [className, styles.label].filter(Boolean).join(" ");

  return (
    <label className={cx(globalStyles, labelClassName)} htmlFor={inputId}>
      <span>{label}</span>
      <span className={cx(globalStyles, styles.shell)}>
        <input {...props} id={inputId} type={isVisible ? "text" : "password"} />
        <button
          aria-label={isVisible ? hideLabel : showLabel}
          aria-pressed={isVisible}
          className={cx(globalStyles, styles.toggle)}
          onClick={() => setIsVisible((current) => !current)}
          type="button"
        >
          {isVisible ? "Ocultar" : "Mostrar"}
        </button>
      </span>
    </label>
  );
}
