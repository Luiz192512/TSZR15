/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ProductVariationEditor } from "../src/components/admin/product-variation-editor.js";

afterEach(() => {
  cleanup();
});

describe("ProductVariationEditor", () => {
  it("edits variation and stock in exactly one field", () => {
    const { container } = render(
      <ProductVariationEditor defaultValue={"Preto=\nAzul=3"} />,
    );

    const field = within(container).getByLabelText("Variações e estoque");
    expect(field.value).toBe("Preto=\nAzul=3");
    expect(
      container.querySelectorAll('textarea[name="variationInventory"]'),
    ).toHaveLength(1);
    expect(
      container.querySelectorAll('input[name="variationName"]'),
    ).toHaveLength(0);
    expect(
      container.querySelectorAll('input[name="variationQuantity"]'),
    ).toHaveLength(0);
    expect(
      within(container).queryByRole("button", { name: "Adicionar variação" }),
    ).toBeNull();

    fireEvent.change(field, { target: { value: "Preto=5\nAzul=" } });
    expect(field.value).toBe("Preto=5\nAzul=");
  });
});
