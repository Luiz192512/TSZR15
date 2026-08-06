import assert from "node:assert/strict";
import test from "node:test";

import { resolveAdminSectionRedirect } from "../src/admin/admin-section-paths.js";

test("rota raiz do admin cai em pedidos quando nao ha secao", () => {
  assert.equal(resolveAdminSectionRedirect(undefined), "/admin/pedidos");
  assert.equal(resolveAdminSectionRedirect({}), "/admin/pedidos");
  assert.equal(resolveAdminSectionRedirect({ tab: "inexistente" }), "/admin/pedidos");
});

test("cada aba antiga vira o segmento de rota equivalente", () => {
  assert.equal(resolveAdminSectionRedirect({ tab: "pedidos" }), "/admin/pedidos");
  assert.equal(resolveAdminSectionRedirect({ tab: "produtos" }), "/admin/produtos");
  assert.equal(resolveAdminSectionRedirect({ tab: "cupons" }), "/admin/cupons");
  assert.equal(resolveAdminSectionRedirect({ tab: "analise" }), "/admin/analise");
});

test("parametros de selecao e paginacao sobrevivem ao redirect de compatibilidade", () => {
  assert.equal(
    resolveAdminSectionRedirect({ paginaProdutos: "2", produto: "abc", tab: "produtos" }),
    "/admin/produtos?paginaProdutos=2&produto=abc"
  );
  assert.equal(
    resolveAdminSectionRedirect({ cupom: "R15OFF", tab: "cupons" }),
    "/admin/cupons?cupom=R15OFF"
  );
  assert.equal(
    resolveAdminSectionRedirect({ pedido: "TSZ-1", status: "salvo" }),
    "/admin/pedidos?pedido=TSZ-1&status=salvo"
  );
  assert.equal(
    resolveAdminSectionRedirect({ novoPedido: "1" }),
    "/admin/pedidos?novoPedido=1"
  );
});

test("valores especiais e repetidos sao preservados com escape correto", () => {
  assert.equal(
    resolveAdminSectionRedirect({ error: "Sessao administrativa expirada.", tab: "cupons" }),
    "/admin/cupons?error=Sessao+administrativa+expirada."
  );
  assert.equal(
    resolveAdminSectionRedirect({ produto: ["a", "b"], tab: "produtos" }),
    "/admin/produtos?produto=a&produto=b"
  );
  assert.equal(resolveAdminSectionRedirect({ produto: undefined }), "/admin/pedidos");
});
