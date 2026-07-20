"use client";

import { startTransition, useActionState, useEffect, useRef } from "react";

const initialProductFormState = {
  error: ""
};

function buildProductFormData(form) {
  const formData = new FormData(form);
  const fileInputs = [...form.querySelectorAll('input[type="file"][name]')];

  for (const name of new Set(fileInputs.map((input) => input.name))) {
    formData.delete(name);
  }

  for (const input of fileInputs) {
    for (const file of input.files ?? []) {
      formData.append(input.name, file);
    }
  }

  return formData;
}

export function AdminProductForm({ action, children, className, errorClassName }) {
  const [state, submitAction, isPending] = useActionState(action, initialProductFormState);
  // isPending so muda apos a transicao agendar; a ref bloqueia o segundo
  // submit disparado antes disso (duplo clique no botao salvar).
  const submitPendingRef = useRef(false);

  useEffect(() => {
    if (!isPending) {
      submitPendingRef.current = false;
    }
  }, [isPending]);

  function handleSubmit(event) {
    event.preventDefault();

    if (submitPendingRef.current) {
      return;
    }

    submitPendingRef.current = true;
    const formData = buildProductFormData(event.currentTarget);

    startTransition(() => {
      submitAction(formData);
    });
  }

  return (
    <form
      aria-busy={isPending}
      className={className}
      encType="multipart/form-data"
      onSubmit={handleSubmit}
    >
      {state?.error ? (
        <p className={errorClassName} role="alert">
          {state.error}
        </p>
      ) : null}
      {children}
    </form>
  );
}
