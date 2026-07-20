import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

function imageFile(index) {
  return {
    arrayBuffer: async () => new ArrayBuffer(0),
    name: `produto-${index}.webp`,
    size: 100,
    type: "image/webp"
  };
}

function formDataWithFiles(count) {
  const files = Array.from({ length: count }, (_, index) => imageFile(index));

  return {
    getAll(name) {
      assert.equal(name, "imageFiles");
      return files;
    }
  };
}

test("backend accepts the same 12-image limit exposed by the admin uploader", async () => {
  const source = await readFile(new URL("../src/admin/catalog-admin.js", import.meta.url), "utf8");
  assert.match(source, /getAdminProductImageFiles\(formData\)/);

  const {
    getAdminProductImageFiles,
    maxAdminProductImages
  } = await import("../src/admin/catalog-product-images.js");

  assert.equal(maxAdminProductImages, 12);
  assert.equal(getAdminProductImageFiles(formDataWithFiles(12)).length, 12);
});

test("backend rejects image payloads above the limit instead of silently truncating them", async () => {
  const source = await readFile(new URL("../src/admin/catalog-admin.js", import.meta.url), "utf8");
  assert.match(source, /getAdminProductImageFiles\(formData\)/);

  const { getAdminProductImageFiles } = await import("../src/admin/catalog-product-images.js");

  assert.throws(
    () => getAdminProductImageFiles(formDataWithFiles(13)),
    /no maximo 12 imagens/i
  );
});
