import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("admin load errors distinguish schema, authorization, connectivity and unknown failures", async () => {
  const { getAdminLoadErrorState } = await import("../src/admin/admin-load-error.js");

  assert.equal(
    getAdminLoadErrorState({ code: "42P01", message: 'relation "catalog_products" does not exist' })
      .kind,
    "schema"
  );
  assert.equal(
    getAdminLoadErrorState({ code: "PGRST205", message: "table missing from schema cache" })
      .kind,
    "schema"
  );
  assert.equal(
    getAdminLoadErrorState({ code: "42501", message: "permission denied" }).kind,
    "authorization"
  );
  assert.equal(
    getAdminLoadErrorState({ code: "PGRST301", message: "JWT expired" }).kind,
    "authorization"
  );
  assert.equal(getAdminLoadErrorState(new TypeError("fetch failed")).kind, "connectivity");
  assert.equal(
    getAdminLoadErrorState({ message: "upstream unavailable", status: 503 }).kind,
    "connectivity"
  );
  assert.equal(
    getAdminLoadErrorState({ code: "XX000", message: "unexpected database failure" }).kind,
    "unknown"
  );
});

test("admin load messages are actionable without leaking the raw database error", async () => {
  const { getAdminLoadErrorState } = await import("../src/admin/admin-load-error.js");
  const authorization = getAdminLoadErrorState({
    code: "42501",
    message: "permission denied password=nao-exibir"
  });
  const connectivity = getAdminLoadErrorState(new TypeError("fetch failed host=interno"));

  assert.match(authorization.message, /chave privilegiada/i);
  assert.match(connectivity.message, /temporariamente indisponivel/i);
  assert.doesNotMatch(authorization.message, /nao-exibir/);
  assert.doesNotMatch(connectivity.message, /host=interno/);
});

test("catalog queries preserve Supabase error metadata for the page classifier", async () => {
  const { createAdminCatalogLoadError, getAdminLoadErrorState } = await import(
    "../src/admin/admin-load-error.js"
  );
  const sourceError = { code: "42501", message: "permission denied", status: 403 };
  const wrapped = createAdminCatalogLoadError(sourceError);

  assert.equal(wrapped.cause, sourceError);
  assert.equal(getAdminLoadErrorState(wrapped).kind, "authorization");

  const catalogSource = await readFile(
    new URL("../src/admin/catalog-admin.js", import.meta.url),
    "utf8"
  );
  assert.match(catalogSource, /throw createAdminCatalogLoadError\(firstError\)/);
  assert.match(catalogSource, /throw createAdminCatalogLoadError\(correctedError\)/g);
});

test("admin page shows migration guidance only for schema failures", async () => {
  const routes = [
    "../app/admin/pedidos/page.js",
    "../app/admin/analise/page.js",
    "../app/admin/produtos/page.js",
    "../app/admin/cupons/page.js"
  ];

  for (const route of routes) {
    const pageSource = await readFile(new URL(route, import.meta.url), "utf8");

    assert.match(pageSource, /const loadError = getAdminLoadErrorState\(error\);/, route);
    assert.match(
      pageSource,
      /mode=\{loadError\.kind === "schema" \? "database" : "service"\}/,
      route
    );
  }

  const setupSource = await readFile(
    new URL("../app/admin/_components/admin-ui.js", import.meta.url),
    "utf8"
  );

  assert.match(setupSource, /isServiceIssue \? "Servico indisponivel"/);
});
