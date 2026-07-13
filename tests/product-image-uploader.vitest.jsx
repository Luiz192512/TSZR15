/** @vitest-environment jsdom */

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, within } from "@testing-library/react";

import { ProductImageUploader } from "../src/components/admin/product-image-uploader.js";

afterEach(() => {
  cleanup();
});

function variationCards(container) {
  return JSON.parse(container.querySelector('input[name="variationCards"]').value);
}

const initialCards = [
  {
    imageUrls: ["/img/preto-1.webp", "/img/preto-2.webp"],
    quantity: "4",
    variation: "Preto"
  },
  {
    imageUrls: ["/img/fume.webp"],
    quantity: "",
    variation: "Fumê"
  }
];

describe("ProductImageUploader variation cards", () => {
  it("keeps native file inputs out of the accessibility tree", () => {
    const { container } = render(<ProductImageUploader initialCards={initialCards} />);

    const fileInputs = [...container.querySelectorAll('input[type="file"]')];

    expect(fileInputs).toHaveLength(2);
    expect(fileInputs.every((input) => input.getAttribute("aria-hidden") === "true")).toBe(true);
    expect(fileInputs.every((input) => input.hidden)).toBe(true);
    expect(fileInputs.every((input) => input.tabIndex === -1)).toBe(true);
  });

  it("builds cards from saved product data and keeps unlinked legacy photos", () => {
    const { container } = render(
      <ProductImageUploader
        existingImageUrls={["/img/preto.webp", "/img/fume.webp", "/img/detalhe.webp"]}
        variationImages={[]}
        variationStock={[
          { quantity: 3, variation: "Preto" },
          { quantity: null, variation: "Fumê" }
        ]}
        variations={["Preto", "Fumê"]}
      />
    );

    expect(variationCards(container)).toEqual([
      {
        imageTokens: ["/img/preto.webp", "/img/detalhe.webp"],
        quantity: "3",
        variation: "Preto"
      },
      {
        imageTokens: ["/img/fume.webp"],
        quantity: "",
        variation: "Fumê"
      }
    ]);
  });

  it("moves the variation together with its stock and images", () => {
    const { container } = render(<ProductImageUploader initialCards={initialCards} />);

    fireEvent.click(within(container).getByLabelText("Mover variação 2 para trás"));

    expect(variationCards(container)).toEqual([
      {
        imageTokens: ["/img/fume.webp"],
        quantity: "",
        variation: "Fumê"
      },
      {
        imageTokens: ["/img/preto-1.webp", "/img/preto-2.webp"],
        quantity: "4",
        variation: "Preto"
      }
    ]);
  });

  it("edits variation and stock inside the image card", () => {
    const { container } = render(<ProductImageUploader initialCards={initialCards} />);

    fireEvent.change(within(container).getByLabelText("Nome da variação 1"), {
      target: { value: "Preto fosco" }
    });
    fireEvent.change(within(container).getByLabelText("Estoque da variação 1"), {
      target: { value: "7" }
    });

    expect(variationCards(container)[0]).toEqual({
      imageTokens: ["/img/preto-1.webp", "/img/preto-2.webp"],
      quantity: "7",
      variation: "Preto fosco"
    });
  });

  it("reorders and removes photos without breaking their variation link", () => {
    const { container } = render(<ProductImageUploader initialCards={initialCards} />);

    fireEvent.click(within(container).getByLabelText("Mover foto 2 da variação 1 para trás"));
    expect(variationCards(container)[0].imageTokens).toEqual([
      "/img/preto-2.webp",
      "/img/preto-1.webp"
    ]);

    fireEvent.click(within(container).getByLabelText("Remover foto 1 da variação 1"));
    expect(variationCards(container)[0].imageTokens).toEqual(["/img/preto-1.webp"]);
  });

  it("adds a new empty variation card", () => {
    const { container } = render(<ProductImageUploader initialCards={initialCards} />);

    fireEvent.click(within(container).getByRole("button", { name: "Adicionar variação" }));

    expect(within(container).getByLabelText("Nome da variação 3")).toBeTruthy();
    expect(variationCards(container)[2]).toEqual({
      imageTokens: [],
      quantity: "",
      variation: ""
    });
  });
});
