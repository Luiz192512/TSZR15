import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Sites Worker enables the Node.js runtime required by OpenNext", async () => {
  const config = JSON.parse(
    await readFile(
      new URL("../.openai/sites-wrangler.json", import.meta.url),
      "utf8",
    ),
  );

  assert.equal(config.main, "index.js");
  assert.equal(config.no_bundle, true);
  assert.ok(config.compatibility_flags.includes("nodejs_compat"));
  assert.equal(config.assets.binding, "ASSETS");
});
