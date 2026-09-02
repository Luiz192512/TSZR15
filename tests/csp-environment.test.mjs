import assert from "node:assert/strict";
import test from "node:test";

// A CSP e montada no carregamento do modulo a partir de NODE_ENV, entao cada
// caso precisa de uma importacao propria com o ambiente ja definido.
async function loadCsp(nodeEnv) {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = nodeEnv;

  try {
    const module = await import(`../src/security/headers.js?env=${nodeEnv}`);

    return module.securityHeaders.find((header) => header.key === "Content-Security-Policy").value;
  } finally {
    process.env.NODE_ENV = previous;
  }
}

// 'unsafe-eval' em producao e o vetor classico de XSS. Ele existe aqui apenas
// porque o React em dev precisa de eval() para hidratar; se vazar para
// producao, o afrouxamento passa a valer para a loja inteira.
test("producao nao libera unsafe-eval nem localhost", async () => {
  const csp = await loadCsp("production");

  assert.doesNotMatch(csp, /unsafe-eval/);
  assert.doesNotMatch(csp, /localhost/);
});

test("desenvolvimento libera o que o React e o hot reload exigem", async () => {
  const csp = await loadCsp("development");

  assert.match(csp, /script-src[^;]*'unsafe-eval'/);
  assert.match(csp, /connect-src[^;]*ws:\/\/localhost:\*/);
});

test("as diretivas de sempre continuam nos dois ambientes", async () => {
  for (const environment of ["production", "development"]) {
    const csp = await loadCsp(environment);

    assert.match(csp, /frame-ancestors 'none'/, environment);
    assert.match(csp, /object-src 'none'/, environment);
    assert.match(csp, /base-uri 'self'/, environment);
    assert.match(csp, /form-action 'self'/, environment);
    assert.match(csp, /script-src 'self'/, environment);
  }
});
