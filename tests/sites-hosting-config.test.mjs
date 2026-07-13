import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Sites Worker enables the Node.js runtime required by OpenNext", async () => {
  const deployConfig = JSON.parse(
    await readFile(
      new URL("../.openai/sites-wrangler.json", import.meta.url),
      "utf8",
    ),
  );
  const bundleConfig = JSON.parse(
    await readFile(
      new URL("../.openai/sites-bundle-wrangler.json", import.meta.url),
      "utf8",
    ),
  );

  assert.equal(deployConfig.main, "index.js");
  assert.equal(deployConfig.no_bundle, true);
  assert.ok(deployConfig.compatibility_flags.includes("nodejs_compat"));
  assert.equal(deployConfig.assets.binding, "ASSETS");

  assert.equal(bundleConfig.main, "sites-worker.mjs");
  assert.ok(bundleConfig.compatibility_flags.includes("nodejs_compat"));
  assert.equal(bundleConfig.assets.binding, "ASSETS");
});
