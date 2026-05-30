"use client";

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
    <button {...props} className={className} disabled={pending || disabled} type={type}>
      {pending ? (
        <>
          <span aria-hidden="true" className="button-loader" />
          {pendingLabel}
        </>
      ) : (
        children
      )}
    </button>
  );
}
