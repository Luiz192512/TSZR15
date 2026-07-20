import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("landscape and portrait crops always cover the 4:3 output", async () => {
  const { getCoverCropRect } = await import("../src/admin/product-image-crop.js");
  const output = { outputHeight: 900, outputWidth: 1200 };
  const cases = [
    { sourceHeight: 900, sourceWidth: 1600 },
    { sourceHeight: 1600, sourceWidth: 900 }
  ];

  for (const source of cases) {
    const rect = getCoverCropRect({
      ...output,
      ...source,
      positionX: 50,
      positionY: 50,
      zoom: 1
    });

    assert.ok(rect.drawWidth >= output.outputWidth);
    assert.ok(rect.drawHeight >= output.outputHeight);
    assert.ok(rect.offsetX <= 0);
    assert.ok(rect.offsetY <= 0);
    assert.ok(rect.offsetX + rect.drawWidth >= output.outputWidth);
    assert.ok(rect.offsetY + rect.drawHeight >= output.outputHeight);
  }
});

test("crop position chooses which covered edge remains visible", async () => {
  const { getCoverCropRect } = await import("../src/admin/product-image-crop.js");
  const left = getCoverCropRect({
    outputHeight: 900,
    outputWidth: 1200,
    positionX: 0,
    positionY: 50,
    sourceHeight: 900,
    sourceWidth: 1600,
    zoom: 1
  });
  const right = getCoverCropRect({
    outputHeight: 900,
    outputWidth: 1200,
    positionX: 100,
    positionY: 50,
    sourceHeight: 900,
    sourceWidth: 1600,
    zoom: 1
  });

  assert.equal(left.offsetX, 0);
  assert.equal(right.offsetX, -400);
});

test("uploader export and preview use the same cover crop behavior", async () => {
  const uploaderSource = await readFile(
    new URL("../src/components/admin/product-image-uploader.js", import.meta.url),
    "utf8"
  );
  const stylesSource = await readFile(new URL("../app/storefront.module.css", import.meta.url), "utf8");

  assert.match(uploaderSource, /getCoverCropRect\(\{/);
  assert.match(
    stylesSource,
    /\.admin-image-crop-stage img\s*\{[\s\S]*?object-fit:\s*cover;/
  );
});
