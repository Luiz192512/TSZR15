/** @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor, within } from "@testing-library/react";

import { ProductImageUploader } from "../src/components/admin/product-image-uploader.js";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
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
        sizes: [],
        variation: "Preto"
      },
      {
        imageTokens: ["/img/fume.webp"],
        quantity: "",
        sizes: [],
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
        sizes: [],
        variation: "Fumê"
      },
      {
        imageTokens: ["/img/preto-1.webp", "/img/preto-2.webp"],
        quantity: "4",
        sizes: [],
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
      sizes: [],
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
      sizes: [],
      variation: ""
    });
  });

  it("monta os tamanhos salvos e serializa a grade por variação", () => {
    const { container } = render(
      <ProductImageUploader
        existingImageUrls={[]}
        variationImages={[]}
        variationStock={[
          { quantity: 2, size: "P", variation: "Padrão" },
          { quantity: 0, size: "M", variation: "Padrão" }
        ]}
        variations={["Padrão"]}
      />
    );

    expect(variationCards(container)[0].sizes).toEqual([
      { quantity: "2", size: "P" },
      { quantity: "0", size: "M" }
    ]);
    expect(within(container).getByLabelText("Estoque da variação 1").disabled).toBe(true);
  });

  it("adiciona, edita e remove tamanhos dentro do card", () => {
    const { container } = render(<ProductImageUploader initialCards={initialCards} />);

    fireEvent.click(within(container).getAllByRole("button", { name: "Adicionar tamanho" })[0]);
    fireEvent.change(within(container).getByLabelText("Tamanho 1 da variação 1"), {
      target: { value: "GG" }
    });
    fireEvent.change(within(container).getByLabelText("Estoque do tamanho 1 da variação 1"), {
      target: { value: "5" }
    });

    expect(variationCards(container)[0].sizes).toEqual([{ quantity: "5", size: "GG" }]);

    fireEvent.click(within(container).getByLabelText("Remover tamanho 1 da variação 1"));

    expect(variationCards(container)[0].sizes).toEqual([]);
  });

  it("adds a cropped image only once while crop processing is pending", async () => {
    let objectUrlIndex = 0;
    vi.spyOn(URL, "createObjectURL").mockImplementation(() => `blob:test-${++objectUrlIndex}`);
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    vi.stubGlobal(
      "Image",
      class FakeImage {
        naturalHeight = 900;
        naturalWidth = 1200;

        set src(_value) {
          queueMicrotask(() => this.onload?.());
        }
      }
    );
    vi.stubGlobal("DataTransfer", undefined);
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage() {},
      fillRect() {},
      fillStyle: "",
      imageSmoothingEnabled: false,
      imageSmoothingQuality: "low"
    });
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) => {
      setTimeout(() => callback(new Blob(["image"], { type: "image/webp" })), 10);
    });

    const { container } = render(
      <ProductImageUploader
        initialCards={[{ imageUrls: [], quantity: "1", variation: "Preto" }]}
      />
    );
    const picker = container.querySelector('input[type="file"]:not([name])');
    const file = new File(["source"], "preto.png", { type: "image/png" });

    fireEvent.click(within(container).getByRole("button", { name: "Adicionar fotos" }));
    fireEvent.change(picker, { target: { files: [file] } });

    const addButton = await within(container).findByRole("button", {
      name: "Adicionar ao card"
    });
    fireEvent.click(addButton);
    fireEvent.click(addButton);

    await waitFor(() => {
      expect(variationCards(container)[0].imageTokens).toHaveLength(1);
    });
  });
});
