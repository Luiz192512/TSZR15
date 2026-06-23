"use client";

import globalStyles from "@/app/storefront.module.css";
import { cx } from "@/src/lib/classnames";
import { useFormStatus } from "react-dom";

export function PendingSubmitButton({
  children,
  className = "button button-primary",
  disabled = false,
  pendingLabel = "Processando...",
  type = "submit",
  ...props
}) {
  const { pending } = useFormStatus();

  return (
    <button
      {...props}
      className={cx(globalStyles, className)}
      disabled={pending || disabled}
      type={type}
    >
      {pending ? (
        <>
          <span aria-hidden="true" className={cx(globalStyles, "button-loader")} />
          {pendingLabel}
        </>
      ) : (
        children
      )}
    </button>
  );
}
