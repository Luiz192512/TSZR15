import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("product save failures return form state instead of redirecting away from the draft", async () => {
  const source = await readFile(new URL("../app/admin/actions.js", import.meta.url), "utf8");
  const start = source.indexOf("export async function upsertAdminProductAction");
  const end = source.indexOf("export async function archiveAdminProductAction", start);
  const actionSource = source.slice(start, end);

  assert.match(
    actionSource,
    /export async function upsertAdminProductAction\(_previousState, formData\)/
  );
  assert.match(actionSource, /return \{\s*error: getActionErrorMessage\(error\)\s*\};/);
  assert.doesNotMatch(actionSource, /redirectWithError\([^\n]+error\.message/);
});
