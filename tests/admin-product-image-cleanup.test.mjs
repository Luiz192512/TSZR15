import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

function imageFile(name) {
  return {
    arrayBuffer: async () => new TextEncoder().encode(name).buffer,
    name,
    size: 100,
    type: "image/webp"
  };
}

function createStorage({ failUploadAt = 0 } = {}) {
  const calls = [];
  let uploadCount = 0;
  const bucket = {
    getPublicUrl(path) {
      return {
        data: {
          publicUrl: `https://project.supabase.co/storage/v1/object/public/product-images/${path}`
        }
      };
    },
    async remove(paths) {
      calls.push({ method: "remove", paths });
      return { error: null };
    },
    async upload(path) {
      uploadCount += 1;
      calls.push({ method: "upload", path });
      return {
        error:
          uploadCount === failUploadAt
            ? { message: "storage unavailable" }
            : null
      };
    }
  };

  return {
    calls,
    supabase: {
      storage: {
        from(name) {
          assert.equal(name, "product-images");
          return bucket;
        }
      }
    }
  };
}

test("a failed upload removes files already uploaded by the same attempt", async () => {
  const { uploadAdminProductImages } = await import("../src/admin/catalog-product-images.js");
  const storage = createStorage({ failUploadAt: 2 });
  const formData = {
    getAll() {
      return [imageFile("primeira.webp"), imageFile("segunda.webp")];
    }
  };

  await assert.rejects(
    () => uploadAdminProductImages({ formData, productId: "produto-1", supabase: storage.supabase }),
    /storage unavailable/
  );

  const uploads = storage.calls.filter((call) => call.method === "upload");
  const removals = storage.calls.filter((call) => call.method === "remove");
  assert.equal(uploads.length, 2);
  assert.deepEqual(removals, [{ method: "remove", paths: [uploads[0].path] }]);
});

test("a rejected product row removes newly uploaded files before they become referenced", async () => {
  const { runWithAdminProductImageCleanup } = await import(
    "../src/admin/catalog-product-images.js"
  );
  const storage = createStorage();

  await assert.rejects(
    () =>
      runWithAdminProductImageCleanup({
        operation: async () => {
          throw new Error("duplicate product");
        },
        paths: ["produto-1/nova.webp"],
        supabase: storage.supabase
      }),
    /duplicate product/
  );

  assert.deepEqual(storage.calls, [
    { method: "remove", paths: ["produto-1/nova.webp"] }
  ]);
});

test("only removed images owned by the edited product are selected for cleanup", async () => {
  const { getRemovedAdminProductImagePaths } = await import(
    "../src/admin/catalog-product-images.js"
  );
  const publicBase = "https://project.supabase.co/storage/v1/object/public/product-images/";

  assert.deepEqual(
    getRemovedAdminProductImagePaths({
      finalImageUrls: [`${publicBase}produto-1/mantida.webp`],
      previousImageUrls: [
        `${publicBase}produto-1/mantida.webp`,
        `${publicBase}produto-1/removida.webp`,
        `${publicBase}outro-produto/compartilhada.webp`,
        "https://cdn.example.com/externa.webp"
      ],
      productId: "produto-1"
    }),
    ["produto-1/removida.webp"]
  );
});

test("catalog save wires upload rollback and post-save removal cleanup", async () => {
  const source = await readFile(new URL("../src/admin/catalog-admin.js", import.meta.url), "utf8");

  assert.match(source, /loadAdminProductImageUrls\(\{[\s\S]*?persistenceMode/);
  assert.match(source, /uploadAdminProductImages\(\{ formData, productId: id, supabase \}\)/);
  assert.match(source, /runWithAdminProductImageCleanup\(\{[\s\S]*?saveAdminCatalogProductAggregate/);
  assert.match(source, /getRemovedAdminProductImagePaths\(\{/);
  assert.match(source, /removeAdminProductImagePaths\(\{ paths: removedImagePaths, supabase \}\)/);
});
