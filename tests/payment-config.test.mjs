import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  findPaymentConfigProblems,
  getPaymentAccessToken,
  getPaymentPublicKey,
  getPaymentWebhookSecret,
  isOnlinePaymentEnabled,
  isSandboxPaymentEnvironment,
  looksLikePublicKey,
  readTokenAccountId
} from "../src/payments/payment-config.js";

const CHAVES = [
  "NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY",
  "NEXT_PUBLIC_MERCADOPAGO_SANDBOX_PUBLIC_KEY",
  "MERCADOPAGO_PUBLIC_KEY",
  "MERCADOPAGO_SANDBOX_PUBLIC_KEY",
  "MERCADOPAGO_ACCESS_TOKEN",
  "MERCADOPAGO_SANDBOX_ACCESS_TOKEN",
  "MERCADOPAGO_WEBHOOK_SECRET",
  "MP_ACCESS_TOKEN",
  "MP_SANDBOX_ACCESS_TOKEN",
  "MP_SANDBOX_WEBHOOK_SECRET",
  "MP_WEBHOOK_SECRET",
  "PAYMENTS_ONLINE_ENABLED",
  "PAYMENTS_PREVIEW_ONLINE_ENABLED",
  "SUPABASE_RUNTIME_TARGET"
];

function comEnv(overrides, assercoes) {
  const anterior = new Map(CHAVES.map((chave) => [chave, process.env[chave]]));

  for (const chave of CHAVES) {
    delete process.env[chave];
  }

  for (const [chave, valor] of Object.entries(overrides)) {
    process.env[chave] = valor;
  }

  try {
    assercoes();
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

// Producao sobe com o fluxo desligado e ele e ligado depois de validado em
// staging, sem novo deploy. Ausente tem que significar desligado.
test("sem a chave de habilitacao o pagamento online fica desligado", () => {
  comEnv({ MERCADOPAGO_ACCESS_TOKEN: "APP_USR-x", MERCADOPAGO_WEBHOOK_SECRET: "s" }, () =>
    assert.equal(isOnlinePaymentEnabled(), false)
  );
});

test("habilitado sem credencial se comporta como desligado", () => {
  comEnv({ PAYMENTS_ONLINE_ENABLED: "true" }, () => assert.equal(isOnlinePaymentEnabled(), false));

  // Sem segredo do webhook nao ha como validar assinatura: melhor desligado do
  // que aceitando confirmacao nao autenticada.
  comEnv({ MERCADOPAGO_ACCESS_TOKEN: "APP_USR-x", PAYMENTS_ONLINE_ENABLED: "true" }, () =>
    assert.equal(isOnlinePaymentEnabled(), false)
  );
});

// A chave e por ambiente: ligar o staging nao pode ligar a loja no ar.
test("a chave de staging nao liga a producao", () => {
  comEnv(
    {
      MERCADOPAGO_ACCESS_TOKEN: "APP_USR-x",
      MERCADOPAGO_WEBHOOK_SECRET: "s",
      PAYMENTS_PREVIEW_ONLINE_ENABLED: "true",
      SUPABASE_RUNTIME_TARGET: "production"
    },
    () => assert.equal(isOnlinePaymentEnabled(), false)
  );
});

test("a chave de producao nao liga o staging", () => {
  comEnv(
    {
      MERCADOPAGO_SANDBOX_ACCESS_TOKEN: "TEST-x",
      MERCADOPAGO_WEBHOOK_SECRET: "s",
      PAYMENTS_ONLINE_ENABLED: "true",
      SUPABASE_RUNTIME_TARGET: "preview"
    },
    () => assert.equal(isOnlinePaymentEnabled(), false)
  );
});

test("staging liga com a propria chave", () => {
  comEnv(
    {
      MERCADOPAGO_SANDBOX_ACCESS_TOKEN: "TEST-x",
      MERCADOPAGO_WEBHOOK_SECRET: "s",
      PAYMENTS_PREVIEW_ONLINE_ENABLED: "true",
      SUPABASE_RUNTIME_TARGET: "preview"
    },
    () => assert.equal(isOnlinePaymentEnabled(), true)
  );
});

// O configurador do Worker de staging manda a chave que o codigo le naquele
// ambiente — e nunca a de producao.
test("o configurador envia a chave de staging, nao a de producao", async () => {
  const script = await readFile(
    new URL("../scripts/configurar-worker-preview.mjs", import.meta.url),
    "utf8"
  );

  assert.match(script, /nome: "PAYMENTS_PREVIEW_ONLINE_ENABLED"/);
  assert.equal(script.includes('nome: "PAYMENTS_ONLINE_ENABLED"'), false);
});

test("habilitado com credencial completa liga", () => {
  comEnv(
    {
      MERCADOPAGO_ACCESS_TOKEN: "APP_USR-x",
      MERCADOPAGO_WEBHOOK_SECRET: "s",
      PAYMENTS_ONLINE_ENABLED: "true"
    },
    () => assert.equal(isOnlinePaymentEnabled(), true)
  );
});

// Fase 4 exigia zero script do provedor: Pix e resolvido no servidor. A fase 5
// abriu UMA excecao — sdk.mercadopago.com — porque a tokenizacao do cartao
// acontece no navegador justamente para que numero e CVV nunca cheguem ao
// servidor. O teste mudou junto com a regra, e continua fechando o resto.
test("a CSP libera so a API e o SDK de tokenizacao do provedor", async () => {
  const source = await readFile(new URL("../src/security/headers.js", import.meta.url), "utf8");

  assert.match(source, /connect-src[^"]*https:\/\/api\.mercadopago\.com/);
  assert.match(source, /script-src[^"]*https:\/\/sdk\.mercadopago\.com/);

  // Nada de iframe do provedor: sem checkout embutido, sem redirect em frame.
  assert.match(source, /"frame-src 'none'"/);

  // O SDK entra so em script-src. Se aparecer em outra diretiva, e sinal de
  // que alguem trouxe checkout embutido junto.
  //
  // A contagem descarta LINHAS de comentario em vez de recortar "//" do texto:
  // um removedor ingenuo de comentario come o "//" de "https://" e apaga a
  // propria linha que deveria conferir.
  const linhasDeCodigo = source
    .split("\n")
    .filter((linha) => !linha.trim().startsWith("//") && !linha.trim().startsWith("*"));
  const ocorrencias = linhasDeCodigo.filter((linha) =>
    linha.includes("sdk.mercadopago.com")
  ).length;

  assert.equal(ocorrencias, 1, "sdk.mercadopago.com deveria aparecer so em script-src");
});

test("as rotas novas tem perfil de rate limit", async () => {
  const source = await readFile(new URL("../src/lib/rate-limit.js", import.meta.url), "utf8");

  assert.match(source, /paymentCharge:/);
  assert.match(source, /paymentWebhook:/);
  assert.match(source, /scope: "payment-charge"/);
  assert.match(source, /scope: "payment-webhook"/);
});

// Perder evento de pagamento por indisponibilidade do limitador e pior do que
// aceitar a rajada — a deduplicacao ja protege o efeito colateral.
test("o webhook nao falha fechado no rate limit", async () => {
  const source = await readFile(new URL("../src/lib/rate-limit.js", import.meta.url), "utf8");
  const perfil = source.slice(source.indexOf("paymentWebhook:"), source.indexOf("tracking:"));

  assert.match(perfil, /failClosed: false/);
});

// O ambiente vem do NOME da variavel, nao de heuristica sobre o valor. Em
// staging o codigo nem le a credencial de producao, entao cobranca real nao
// escapa por configuracao errada.
test("staging le somente as variaveis de sandbox", () => {
  comEnv(
    {
      MERCADOPAGO_ACCESS_TOKEN: "APP_USR-producao",
      MERCADOPAGO_SANDBOX_ACCESS_TOKEN: "APP_USR-de-usuario-de-teste",
      MERCADOPAGO_WEBHOOK_SECRET: "segredo-unico",
      SUPABASE_RUNTIME_TARGET: "preview"
    },
    () => {
      assert.equal(isSandboxPaymentEnvironment(), true);
      assert.equal(getPaymentAccessToken(), "APP_USR-de-usuario-de-teste");
      assert.equal(getPaymentWebhookSecret(), "segredo-unico");
    }
  );
});

test("producao le somente as variaveis de producao", () => {
  comEnv(
    {
      MERCADOPAGO_ACCESS_TOKEN: "APP_USR-producao",
      MERCADOPAGO_SANDBOX_ACCESS_TOKEN: "APP_USR-teste",
      MERCADOPAGO_WEBHOOK_SECRET: "segredo-unico",
      SUPABASE_RUNTIME_TARGET: "production"
    },
    () => {
      assert.equal(isSandboxPaymentEnvironment(), false);
      assert.equal(getPaymentAccessToken(), "APP_USR-producao");
      assert.equal(getPaymentWebhookSecret(), "segredo-unico");
    }
  );
});

// Sem fallback entre os conjuntos: staging sem credencial fica DESLIGADO, e
// nunca cai na de producao. Mesma regra dos dois projetos Supabase.
test("staging sem access token de sandbox nao cai no de producao", () => {
  comEnv(
    {
      MERCADOPAGO_ACCESS_TOKEN: "APP_USR-producao",
      MERCADOPAGO_WEBHOOK_SECRET: "segredo-unico",
      PAYMENTS_ONLINE_ENABLED: "true",
      SUPABASE_RUNTIME_TARGET: "preview"
    },
    () => {
      // O que move dinheiro NAO tem fallback.
      assert.equal(getPaymentAccessToken(), "");
      assert.equal(isOnlinePaymentEnabled(), false);
    }
  );
});

// Nao existe par sandbox/producao para o webhook: o painel do provedor tem UMA
// configuracao so. O segredo nao move dinheiro, ele so verifica quem enviou o
// evento — o access token, que autoriza cobranca, continua separado.
test("o segredo do webhook e o mesmo nos dois ambientes", () => {
  comEnv(
    {
      MERCADOPAGO_SANDBOX_ACCESS_TOKEN: "TEST-x",
      MERCADOPAGO_WEBHOOK_SECRET: "segredo-unico",
      SUPABASE_RUNTIME_TARGET: "preview"
    },
    () => assert.equal(getPaymentWebhookSecret(), "segredo-unico")
  );
});

test("producao usa o mesmo segredo do webhook", () => {
  comEnv(
    {
      MERCADOPAGO_ACCESS_TOKEN: "APP_USR-x",
      MERCADOPAGO_WEBHOOK_SECRET: "segredo-unico",
      SUPABASE_RUNTIME_TARGET: "production"
    },
    () => assert.equal(getPaymentWebhookSecret(), "segredo-unico")
  );
});

// A variavel de sandbox foi uma invencao nossa e nao existe no provedor. Se
// alguem recriar, o diagnostico volta a mostrar "vazia" para sempre.
test("nao existe variavel de segredo especifica de sandbox", async () => {
  const config = await readFile(
    new URL("../src/payments/payment-config.js", import.meta.url),
    "utf8"
  );

  assert.equal(config.includes("SANDBOX_WEBHOOK_SECRET"), false);
});

// Com o segredo compartilhado, o pagamento liga em staging so com o access
// token de sandbox — que e o que realmente separa os ambientes.
test("staging liga com access token de sandbox e o segredo compartilhado", () => {
  comEnv(
    {
      MERCADOPAGO_SANDBOX_ACCESS_TOKEN: "TEST-x",
      MERCADOPAGO_WEBHOOK_SECRET: "segredo-unico",
      PAYMENTS_PREVIEW_ONLINE_ENABLED: "true",
      SUPABASE_RUNTIME_TARGET: "preview"
    },
    () => assert.equal(isOnlinePaymentEnabled(), true)
  );
});

// Comparar o TEXTO nao basta: dois tokens diferentes podem abrir a MESMA conta.
// Foi o que aconteceu de verdade — a variavel de producao guardava a credencial
// do usuario de teste, e a loja subiria "funcionando" sem o dinheiro chegar em
// conta nenhuma.
test("credenciais diferentes para a mesma conta sao reportadas", () => {
  comEnv(
    {
      MERCADOPAGO_ACCESS_TOKEN: "APP_USR-1111111111111111-090101-abc-2222222222",
      MERCADOPAGO_SANDBOX_ACCESS_TOKEN: "TEST-1111111111111111-090101-xyz-2222222222",
      MERCADOPAGO_WEBHOOK_SECRET: "s",
      SUPABASE_RUNTIME_TARGET: "preview"
    },
    () => assert.match(findPaymentConfigProblems().join(" "), /MESMA conta \(2222222222\)/)
  );
});

test("contas diferentes nao sao reportadas", () => {
  comEnv(
    {
      MERCADOPAGO_ACCESS_TOKEN: "APP_USR-1111111111111111-090101-abc-111111111",
      MERCADOPAGO_SANDBOX_ACCESS_TOKEN: "TEST-1111111111111111-090101-xyz-2222222222",
      MERCADOPAGO_WEBHOOK_SECRET: "s",
      NEXT_PUBLIC_MERCADOPAGO_SANDBOX_PUBLIC_KEY: "TEST-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      SUPABASE_RUNTIME_TARGET: "preview"
    },
    () => assert.equal(findPaymentConfigProblems().join(" ").includes("MESMA conta"), false)
  );
});

test("a conta sai do ultimo segmento do token", () => {
  assert.equal(readTokenAccountId("TEST-1111111111111111-090101-xyz-2222222222"), "2222222222");
  assert.equal(readTokenAccountId("nao-e-token"), "");
  assert.equal(readTokenAccountId(""), "");
  assert.equal(readTokenAccountId(null), "");
});

test("mesma credencial nos dois lados e reportada", () => {
  comEnv(
    {
      MERCADOPAGO_ACCESS_TOKEN: "APP_USR-mesma",
      MERCADOPAGO_SANDBOX_ACCESS_TOKEN: "APP_USR-mesma",
      MERCADOPAGO_WEBHOOK_SECRET: "s",
      SUPABASE_RUNTIME_TARGET: "preview"
    },
    () => assert.match(findPaymentConfigProblems().join(" "), /idêntico ao de produção/)
  );
});

test("credencial TEST- na variavel de producao e reportada", () => {
  comEnv(
    {
      MERCADOPAGO_ACCESS_TOKEN: "TEST-na-variavel-errada",
      MERCADOPAGO_WEBHOOK_SECRET: "s",
      SUPABASE_RUNTIME_TARGET: "production"
    },
    () => assert.match(findPaymentConfigProblems().join(" "), /variável de produção/)
  );
});

test("a mensagem de credencial faltando diz qual conjunto", () => {
  comEnv({ SUPABASE_RUNTIME_TARGET: "preview" }, () =>
    assert.match(findPaymentConfigProblems().join(" "), /MERCADOPAGO_SANDBOX_\*/)
  );
});

test("a mensagem do segredo diz que a chave e a mesma nos dois ambientes", () => {
  comEnv({ MERCADOPAGO_SANDBOX_ACCESS_TOKEN: "TEST-x", SUPABASE_RUNTIME_TARGET: "preview" }, () =>
    assert.match(findPaymentConfigProblems().join(" "), /mesma chave nos dois ambientes/)
  );
});

// O handler entende UM tipo de evento: "payment". Order, contestacao e alerta
// de fraude trazem id de outra entidade — sem filtro, a rota buscaria esse id
// como pagamento, falharia, e o provedor reenviaria para sempre.
test("o webhook ignora tipo de evento que nao sabe tratar", async () => {
  const rota = await readFile(
    new URL("../app/api/pagamento/webhook/route.js", import.meta.url),
    "utf8"
  );

  assert.match(rota, /eventType && !eventType\.startsWith\("payment"\)/);
  assert.match(rota, /return ok\("tipo_nao_tratado"\)/);

  // O filtro precisa vir ANTES da consulta ao provedor, senao o efeito e o
  // mesmo de nao ter filtro.
  assert.ok(
    rota.indexOf("tipo_nao_tratado") < rota.indexOf("getProviderPayment("),
    "o filtro de tipo deve preceder a consulta ao provedor"
  );
});

// No painel a Public Key e o Access Token ficam colados e tem o mesmo prefixo.
// Colar um no lugar do outro so produz "invalid_token" da API, sem dizer o
// motivo — o diagnostico precisa vir do nosso lado.
test("Public Key e Access Token sao distinguidos pelo formato", () => {
  assert.equal(looksLikePublicKey("TEST-d4cfcd0f-1f90-4386-8604-3fbf5ad939e5"), true);
  assert.equal(looksLikePublicKey("APP_USR-d4cfcd0f-1f90-4386-8604-3fbf5ad939e5"), true);

  // Access Token: mais longo, com segmentos numericos.
  assert.equal(looksLikePublicKey("APP_USR-3333333333333333-082606-5ab4a9-4444444444"), false);
  assert.equal(looksLikePublicKey(""), false);
});

test("Public Key na variavel de access token e reportada", () => {
  comEnv(
    {
      MERCADOPAGO_ACCESS_TOKEN: "APP_USR-d4cfcd0f-1f90-4386-8604-3fbf5ad939e5",
      MERCADOPAGO_WEBHOOK_SECRET: "s",
      SUPABASE_RUNTIME_TARGET: "production"
    },
    () => assert.match(findPaymentConfigProblems().join(" "), /formato de Public Key/)
  );
});

// A Public Key vai para o NAVEGADOR tokenizar o cartao — sem ela, numero e CVV
// nao teriam como ficar fora do servidor.
test("a Public Key segue a mesma separacao por ambiente", () => {
  comEnv(
    {
      NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY: "APP_USR-producao",
      NEXT_PUBLIC_MERCADOPAGO_SANDBOX_PUBLIC_KEY: "TEST-sandbox",
      SUPABASE_RUNTIME_TARGET: "preview"
    },
    () => assert.equal(getPaymentPublicKey(), "TEST-sandbox")
  );

  comEnv(
    {
      NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY: "APP_USR-producao",
      NEXT_PUBLIC_MERCADOPAGO_SANDBOX_PUBLIC_KEY: "TEST-sandbox",
      SUPABASE_RUNTIME_TARGET: "production"
    },
    () => assert.equal(getPaymentPublicKey(), "APP_USR-producao")
  );
});

test("Public Key ausente e reportada", () => {
  comEnv(
    {
      MERCADOPAGO_ACCESS_TOKEN: "APP_USR-3333333333333333-082606-5ab4a9-4444444444",
      MERCADOPAGO_WEBHOOK_SECRET: "s",
      SUPABASE_RUNTIME_TARGET: "production"
    },
    () => assert.match(findPaymentConfigProblems().join(" "), /Public Key.*ausente/)
  );
});
