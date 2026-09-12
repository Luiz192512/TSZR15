import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { findEnvironmentIncoherences } from "../src/lib/environment-guard.js";
import { getRuntimeTarget } from "../src/lib/runtime-target.js";
import { getSupabaseServiceRoleKey, getSupabaseUrl } from "../src/lib/supabase/config.js";

const CONTROLLED_ENV_KEYS = [
  "MERCADOPAGO_ACCESS_TOKEN",
  "MERCADOPAGO_SANDBOX_ACCESS_TOKEN",
  "MP_ACCESS_TOKEN",
  "MP_SANDBOX_ACCESS_TOKEN",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_SUPABASE_PREVIEW_ANON_KEY",
  "NEXT_PUBLIC_SUPABASE_PREVIEW_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SUPABASE_PREVIEW_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SUPABASE_RUNTIME_TARGET",
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_PREVIEW_ANON_KEY",
  "SUPABASE_PREVIEW_PUBLISHABLE_KEY",
  "SUPABASE_PREVIEW_SECRET_KEY",
  "SUPABASE_PREVIEW_SERVICE_ROLE_KEY",
  "SUPABASE_PREVIEW_URL",
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_RUNTIME_TARGET",
  "SUPABASE_SECRET_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_URL",
  "TSZR15_ADMIN_TOKEN",
  "TSZR15_PREVIEW_ADMIN_TOKEN",
  "VERCEL_ENV"
];

const PRODUCTION_URL = "https://producao.supabase.co";
const PREVIEW_URL = "https://preview.supabase.co";

function withEnv(overrides, assertions) {
  const snapshot = new Map(CONTROLLED_ENV_KEYS.map((key) => [key, process.env[key]]));

  for (const key of CONTROLLED_ENV_KEYS) {
    delete process.env[key];
  }

  for (const [key, value] of Object.entries(overrides)) {
    process.env[key] = value;
  }

  try {
    assertions();
  } finally {
    for (const key of CONTROLLED_ENV_KEYS) {
      delete process.env[key];
    }

    for (const [key, value] of snapshot) {
      if (value !== undefined) {
        process.env[key] = value;
      }
    }
  }
}

test("sem alvo declarado o ambiente resolve para producao", () => {
  withEnv({ NEXT_PUBLIC_SUPABASE_URL: PRODUCTION_URL }, () => {
    assert.equal(getRuntimeTarget(), "production");
    assert.equal(getSupabaseUrl(), PRODUCTION_URL);
  });
});

test("alvo preview resolve as credenciais de preview", () => {
  withEnv(
    {
      NEXT_PUBLIC_SUPABASE_PREVIEW_URL: PREVIEW_URL,
      NEXT_PUBLIC_SUPABASE_URL: PRODUCTION_URL,
      SUPABASE_PREVIEW_SERVICE_ROLE_KEY: "chave-preview",
      SUPABASE_RUNTIME_TARGET: "preview",
      SUPABASE_SERVICE_ROLE_KEY: "chave-producao"
    },
    () => {
      assert.equal(getRuntimeTarget(), "preview");
      assert.equal(getSupabaseUrl(), PREVIEW_URL);
      assert.equal(getSupabaseServiceRoleKey(), "chave-preview");
    }
  );
});

// Regressao principal da Fase 0: o fallback antigo concatenava as chaves de
// producao, entao um preview sem URL propria escrevia no banco de producao.
test("preview sem credencial propria NAO cai no banco de producao", () => {
  withEnv(
    {
      NEXT_PUBLIC_SUPABASE_URL: PRODUCTION_URL,
      SUPABASE_RUNTIME_TARGET: "preview",
      SUPABASE_SERVICE_ROLE_KEY: "chave-producao"
    },
    () => {
      assert.equal(getSupabaseUrl(), "");
      assert.equal(getSupabaseServiceRoleKey(), "");
    }
  );
});

// O deploy e Cloudflare Workers: VERCEL_ENV nunca existe la, entao usar essa
// variavel como sinal de preview significava resolver producao em silencio.
test("VERCEL_ENV nao decide mais o ambiente", () => {
  withEnv(
    {
      NEXT_PUBLIC_SUPABASE_PREVIEW_URL: PREVIEW_URL,
      NEXT_PUBLIC_SUPABASE_URL: PRODUCTION_URL,
      VERCEL_ENV: "preview"
    },
    () => {
      assert.equal(getRuntimeTarget(), "production");
      assert.equal(getSupabaseUrl(), PRODUCTION_URL);
    }
  );
});

test("alvo desconhecido falha alto em vez de virar producao", () => {
  withEnv({ SUPABASE_RUNTIME_TARGET: "staging" }, () => {
    assert.throws(() => getRuntimeTarget(), /SUPABASE_RUNTIME_TARGET inválido/);
  });
});

test("ambiente coerente nao reporta problema", () => {
  withEnv(
    {
      NEXT_PUBLIC_SUPABASE_PREVIEW_URL: PREVIEW_URL,
      NEXT_PUBLIC_SUPABASE_URL: PRODUCTION_URL,
      SUPABASE_RUNTIME_TARGET: "production",
      SUPABASE_SERVICE_ROLE_KEY: "chave-producao"
    },
    () => {
      assert.deepEqual(findEnvironmentIncoherences(), []);
    }
  );
});

test("preview apontando para o projeto de producao e incoerencia", () => {
  withEnv(
    {
      NEXT_PUBLIC_SUPABASE_PREVIEW_URL: PRODUCTION_URL,
      NEXT_PUBLIC_SUPABASE_URL: PRODUCTION_URL,
      SUPABASE_RUNTIME_TARGET: "preview"
    },
    () => {
      const problems = findEnvironmentIncoherences();

      assert.equal(problems.length, 1);
      assert.match(problems[0], /mesmo projeto/);
    }
  );
});

test("chave de servico compartilhada entre ambientes e incoerencia", () => {
  withEnv(
    {
      NEXT_PUBLIC_SUPABASE_PREVIEW_URL: PREVIEW_URL,
      NEXT_PUBLIC_SUPABASE_URL: PRODUCTION_URL,
      SUPABASE_PREVIEW_SERVICE_ROLE_KEY: "mesma-chave",
      SUPABASE_RUNTIME_TARGET: "preview",
      SUPABASE_SERVICE_ROLE_KEY: "mesma-chave"
    },
    () => {
      const problems = findEnvironmentIncoherences();

      assert.equal(problems.length, 1);
      assert.match(problems[0], /idêntica à chave de serviço de produção/);
    }
  );
});

test("preview com chave de servico apenas de producao e incoerencia", () => {
  withEnv(
    {
      NEXT_PUBLIC_SUPABASE_PREVIEW_URL: PREVIEW_URL,
      NEXT_PUBLIC_SUPABASE_URL: PRODUCTION_URL,
      SUPABASE_RUNTIME_TARGET: "preview",
      SUPABASE_SERVICE_ROLE_KEY: "chave-producao"
    },
    () => {
      const problems = findEnvironmentIncoherences();

      assert.equal(problems.length, 1);
      assert.match(problems[0], /só existe SUPABASE_SERVICE_ROLE_KEY de produção/);
    }
  );
});

// Teste e producao vivem em variaveis distintas. Mesma credencial nos dois
// lados anula a separacao inteira: staging cobraria de verdade.
test("mesma credencial de pagamento nos dois ambientes e incoerencia", () => {
  withEnv(
    {
      MERCADOPAGO_ACCESS_TOKEN: "APP_USR-mesma",
      MERCADOPAGO_SANDBOX_ACCESS_TOKEN: "APP_USR-mesma",
      NEXT_PUBLIC_SUPABASE_PREVIEW_URL: PREVIEW_URL,
      SUPABASE_PREVIEW_SERVICE_ROLE_KEY: "chave-preview",
      SUPABASE_RUNTIME_TARGET: "preview"
    },
    () => {
      const problems = findEnvironmentIncoherences();

      assert.equal(problems.length, 1);
      assert.match(problems[0], /Staging faria cobrança real/);
    }
  );
});

test("credencial TEST- na variavel de producao e incoerencia", () => {
  withEnv(
    {
      MERCADOPAGO_ACCESS_TOKEN: "TEST-na-variavel-errada",
      NEXT_PUBLIC_SUPABASE_URL: PRODUCTION_URL,
      SUPABASE_RUNTIME_TARGET: "production"
    },
    () => {
      const problems = findEnvironmentIncoherences();

      assert.equal(problems.length, 1);
      assert.match(problems[0], /variável de produção/);
    }
  );
});

// Em staging o app nem le a variavel de producao; ter a credencial real no
// ambiente do Worker de preview e risco sem beneficio.
test("preview so com a credencial de producao e incoerencia", () => {
  withEnv(
    {
      MERCADOPAGO_ACCESS_TOKEN: "APP_USR-real",
      NEXT_PUBLIC_SUPABASE_PREVIEW_URL: PREVIEW_URL,
      SUPABASE_PREVIEW_SERVICE_ROLE_KEY: "chave-preview",
      SUPABASE_RUNTIME_TARGET: "preview"
    },
    () => {
      const problems = findEnvironmentIncoherences();

      assert.equal(problems.length, 1);
      assert.match(problems[0], /Configure MERCADOPAGO_SANDBOX_ACCESS_TOKEN/);
    }
  );
});

test("token administrativo compartilhado entre ambientes e incoerencia", () => {
  withEnv(
    {
      NEXT_PUBLIC_SUPABASE_URL: PRODUCTION_URL,
      SUPABASE_RUNTIME_TARGET: "production",
      TSZR15_ADMIN_TOKEN: "mesmo-token",
      TSZR15_PREVIEW_ADMIN_TOKEN: "mesmo-token"
    },
    () => {
      const problems = findEnvironmentIncoherences();

      assert.equal(problems.length, 1);
      assert.match(problems[0], /idêntico ao token de produção/);
    }
  );
});

test("os dois Workers declaram o alvo de ambiente no proprio config", async () => {
  const productionConfig = await readFile(new URL("../wrangler.jsonc", import.meta.url), "utf8");
  const previewConfig = await readFile(
    new URL("../wrangler.preview.jsonc", import.meta.url),
    "utf8"
  );

  assert.match(productionConfig, /"SUPABASE_RUNTIME_TARGET"\s*:\s*"production"/);
  assert.match(previewConfig, /"SUPABASE_RUNTIME_TARGET"\s*:\s*"preview"/);
});
