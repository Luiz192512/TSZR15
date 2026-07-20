/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AdminProductForm } from "@/src/components/admin/admin-product-form.js";

afterEach(cleanup);

describe("AdminProductForm", () => {
  it("keeps text and selected files when the server action returns an error", async () => {
    const action = vi.fn(async () => ({ error: "Falha ao salvar o produto." }));
    const { container } = render(
      <AdminProductForm action={action} className="product-form">
        <input defaultValue="Produto inicial" name="name" />
        <input aria-label="Imagens" multiple name="imageFiles" type="file" />
        <button type="submit">Salvar</button>
      </AdminProductForm>
    );
    const form = container.querySelector("form");
    const nameInput = screen.getByDisplayValue("Produto inicial");
    const fileInput = screen.getByLabelText("Imagens");
    const image = new File(["imagem"], "produto.webp", { type: "image/webp" });

    fireEvent.change(nameInput, { target: { value: "Produto alterado" } });
    fireEvent.change(fileInput, { target: { files: [image] } });
    fireEvent.submit(form);

    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Falha ao salvar o produto."
    );
    expect(nameInput.value).toBe("Produto alterado");
    expect(fileInput.files).toHaveLength(1);
    expect(fileInput.files[0].name).toBe("produto.webp");

    const submittedFormData = action.mock.calls[0][1];
    expect(submittedFormData.get("name")).toBe("Produto alterado");
    expect(submittedFormData.get("imageFiles").name).toBe("produto.webp");
  });

  it("ignores repeated submits while the server action is still pending", async () => {
    let resolveAction;
    const action = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveAction = resolve;
        })
    );
    const { container } = render(
      <AdminProductForm action={action} className="product-form">
        <input defaultValue="Produto" name="name" />
        <button type="submit">Salvar</button>
      </AdminProductForm>
    );
    const form = container.querySelector("form");

    fireEvent.submit(form);
    fireEvent.submit(form);
    fireEvent.submit(form);

    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));

    resolveAction({ error: "Falha ao salvar o produto." });
    await screen.findByRole("alert");

    fireEvent.submit(form);
    await waitFor(() => expect(action).toHaveBeenCalledTimes(2));
  });
});
