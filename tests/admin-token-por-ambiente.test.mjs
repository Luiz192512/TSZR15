import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const CHAVES = ["TSZR15_ADMIN_TOKEN", "TSZR15_PREVIEW_ADMIN_TOKEN", "SUPABASE_RUNTIME_TARGET"];

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

function comEnv(overrides, assercoes) {
  const anterior = new Map(CHAVES.map((chave) => [chave, process.env[chave]]));

  for (const chave of CHAVES) {
    delete process.env[chave];
  }

  for (const [chave, valor] of Object.entries(overrides)) {
    process.env[chave] = valor;
  }

  try {
    return assercoes();
  } finally {
    for (const chave of CHAVES) {
      delete process.env[chave];
    }

    for (const [chave, valor] of anterior) {
      if (valor !== undefined) {
        process.env[chave] = valor;
      }
    }
  }
}

// O staging tem token proprio. Sem esta separacao o painel de staging usaria o
// token da loja no ar — quem tivesse acesso ao staging entraria na producao.
test("staging le somente o token de preview", async () => {
  const { getConfiguredAdminToken } = await import("../src/admin/admin-session.js");

  comEnv(
    {
      SUPABASE_RUNTIME_TARGET: "preview",
      TSZR15_ADMIN_TOKEN: "token-de-producao",
      TSZR15_PREVIEW_ADMIN_TOKEN: "token-de-staging"
    },
    () => assert.equal(getConfiguredAdminToken(), "token-de-staging")
  );
});

test("producao le somente o token de producao", async () => {
  const { getConfiguredAdminToken } = await import("../src/admin/admin-session.js");

  comEnv(
    {
      SUPABASE_RUNTIME_TARGET: "production",
      TSZR15_ADMIN_TOKEN: "token-de-producao",
      TSZR15_PREVIEW_ADMIN_TOKEN: "token-de-staging"
    },
    () => assert.equal(getConfiguredAdminToken(), "token-de-producao")
  );
});

// Sem fallback: staging sem token proprio fica com o admin DESLIGADO.
test("staging sem token proprio nao cai no de producao", async () => {
  const { getConfiguredAdminToken, isAdminTokenValueConfigured } =
    await import("../src/admin/admin-session.js");

  comEnv(
    { SUPABASE_RUNTIME_TARGET: "preview", TSZR15_ADMIN_TOKEN: "token-de-producao-bem-longo" },
    () => {
      assert.equal(getConfiguredAdminToken(), "");
      assert.equal(isAdminTokenValueConfigured(), false);
    }
  );
});

// O cookie de sessao e assinado com o token. Os dois lados resolvendo variaveis
// diferentes significaria entrar pelo middleware e ser recusado pelo servidor.
test("o edge e o servidor resolvem o token da mesma forma", async () => {
  const servidor = await source("src/admin/admin-session.js");
  const edge = await source("src/admin/admin-session-edge.js");
  const linha = /isPreviewTarget\(\) \? "TSZR15_PREVIEW_ADMIN_TOKEN" : "TSZR15_ADMIN_TOKEN"/;

  assert.match(servidor, linha);
  assert.match(edge, linha);
});

// O configurador manda cada variavel com o proprio nome, entao o Worker de
// staging recebe TSZR15_PREVIEW_ADMIN_TOKEN — e o codigo tem que ler esse nome.
test("o configurador do worker envia a variavel que o codigo le", async () => {
  const script = await source("scripts/configurar-worker-preview.mjs");

  assert.match(script, /nome: "TSZR15_PREVIEW_ADMIN_TOKEN"/);
  assert.match(script, /"wrangler", "secret", "put", item\.nome/);
});
