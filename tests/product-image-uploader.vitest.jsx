/** @vitest-environment jsdom */

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, within } from "@testing-library/react";

import { ProductImageUploader } from "../src/components/admin/product-image-uploader.js";

afterEach(() => {
  cleanup();
});

function imageOrder(container) {
  return container.querySelector('input[name="imageOrder"]').value.split("\n");
}

describe("ProductImageUploader reordenacao", () => {
  it("move uma imagem para tras e para frente atualizando imageOrder", () => {
    const urls = ["/img/a.webp", "/img/b.webp", "/img/c.webp"];
    const { container } = render(<ProductImageUploader existingImageUrls={urls} />);

    expect(imageOrder(container)).toEqual(["/img/a.webp", "/img/b.webp", "/img/c.webp"]);

    // Sobe a imagem 3 (c) -> troca com a imagem 2 (b).
    fireEvent.click(within(container).getByLabelText("Mover imagem 3 para tras"));
    expect(imageOrder(container)).toEqual(["/img/a.webp", "/img/c.webp", "/img/b.webp"]);

    // Desce a imagem 1 (a) -> troca com a atual imagem 2 (c).
    fireEvent.click(within(container).getByLabelText("Mover imagem 1 para frente"));
    expect(imageOrder(container)).toEqual(["/img/c.webp", "/img/a.webp", "/img/b.webp"]);
  });

  it("remove uma imagem e reflete no imageOrder", () => {
    const urls = ["/img/a.webp", "/img/b.webp", "/img/c.webp"];
    const { container } = render(<ProductImageUploader existingImageUrls={urls} />);

    fireEvent.click(within(container).getByLabelText("Remover imagem 2"));
    expect(imageOrder(container)).toEqual(["/img/a.webp", "/img/c.webp"]);
  });

  it("desabilita as setas nas extremidades", () => {
    const { container } = render(
      <ProductImageUploader existingImageUrls={["/img/a.webp", "/img/b.webp"]} />
    );

    expect(within(container).getByLabelText("Mover imagem 1 para tras").disabled).toBe(true);
    expect(within(container).getByLabelText("Mover imagem 2 para frente").disabled).toBe(true);
    expect(within(container).getByLabelText("Mover imagem 1 para frente").disabled).toBe(false);
  });
});
