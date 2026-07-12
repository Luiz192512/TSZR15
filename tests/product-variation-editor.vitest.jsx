/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ProductVariationEditor } from "../src/components/admin/product-variation-editor.js";

afterEach(() => {
  cleanup();
});

describe("ProductVariationEditor", () => {
  it("edits variation and stock together in repeatable rows", () => {
    const { container } = render(
      <ProductVariationEditor
        initialRows={[
          { name: "Preto", quantity: "" },
          { name: "Azul", quantity: "3" },
        ]}
      />,
    );

    expect(within(container).getByLabelText("Nome da variação 1").value).toBe(
      "Preto",
    );
    expect(
      within(container).getByLabelText("Estoque da variação Preto").value,
    ).toBe("");
    expect(
      within(container).getByLabelText("Estoque da variação Azul").value,
    ).toBe("3");

    fireEvent.click(
      within(container).getByRole("button", { name: "Adicionar variação" }),
    );
    expect(within(container).getByLabelText("Nome da variação 3")).toBeTruthy();

    fireEvent.click(
      within(container).getByRole("button", { name: "Remover variação Azul" }),
    );
    expect(within(container).queryByDisplayValue("Azul")).toBeNull();
    expect(
      container.querySelectorAll('input[name="variationName"]'),
    ).toHaveLength(2);
    expect(
      container.querySelectorAll('input[name="variationQuantity"]'),
    ).toHaveLength(2);
  });
});
