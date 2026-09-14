import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { afterEach, test } from "node:test";

import { redactSensitive } from "../src/lib/logger.js";
import {
  clearLocalRateLimitStore,
  consumeRateLimit,
  rateLimitProfiles
} from "../src/lib/rate-limit.js";
import {
  applyProviderPayment,
  causaDoBanco,
  PaymentBackendError
} from "../src/payments/payment-backend.js";

afterEach(() => {
  clearLocalRateLimitStore();
});

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

function semComentarios(codigo) {
  return codigo.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/[^\n]*$/gm, "");
}

// O que o gateway do Supabase devolveu no incidente de 2026-09-14, quando o
// webhook do Mercado Pago rodou no data center IAD: 502 com uma pagina HTML.
const FALHA_DO_GATEWAY = {
  data: null,
  error: {
    code: "",
    details: "",
    hint: "",
    message: "<html><head><title>502 Bad Gateway</title></head></html>"
  },
  status: 502
};

function rpcQueFalha() {
  return { rpc: async () => FALHA_DO_GATEWAY };
}

function consultaQueFalha() {
  const cadeia = {
    eq: () => cadeia,
    maybeSingle: async () => FALHA_DO_GATEWAY,
    select: () => cadeia
  };

  return { from: () => cadeia };
}

test("webhook: erro do banco no limitador nao barra a notificacao", async () => {
  const resultado = await consumeRateLimit({
    ...rateLimitProfiles.paymentWebhook,
    identifier: "198.51.100.7",
    supabase: rpcQueFalha()
  });

  assert.equal(resultado.allowed, true, "503 aqui faz o provedor tratar a loja como fora do ar");
  assert.equal(resultado.unavailable, false);
  assert.equal(resultado.degradado, true);
  assert.deepEqual(resultado.causa, { codigo: "", statusHttp: 502 });
});

test("login continua bloqueando quando o banco falha", async () => {
  const resultado = await consumeRateLimit({
    ...rateLimitProfiles.adminLogin,
    identifier: "198.51.100.7:admin",
    supabase: rpcQueFalha()
  });

  assert.equal(resultado.allowed, false);
  assert.equal(resultado.unavailable, true);
  assert.equal(resultado.degradado, undefined);
  assert.equal(resultado.causa.statusHttp, 502);
});

test("o limitador degradado ainda conta dentro do Worker", async () => {
  const perfil = { ...rateLimitProfiles.paymentWebhook, limit: 2 };
  const supabase = rpcQueFalha();
  const chamar = () => consumeRateLimit({ ...perfil, identifier: "198.51.100.8", supabase });

  assert.equal((await chamar()).allowed, true);
  assert.equal((await chamar()).allowed, true);
  assert.equal((await chamar()).allowed, false, "tolerante nao quer dizer sem limite");
});

test("a falha de leitura do pagamento carrega o status do banco", async () => {
  await assert.rejects(
    applyProviderPayment({
      providerPayment: { providerPaymentId: "177964697415", status: "recusado" },
      supabase: consultaQueFalha()
    }),
    (erro) => {
      assert.ok(erro instanceof PaymentBackendError);
      assert.equal(erro.status, 500);
      assert.deepEqual(erro.causaBanco, { codigo: "", statusHttp: 502 });

      return true;
    }
  );
});

test("a causa do banco sobrevive ao logger e nao leva a mensagem", () => {
  const causa = causaDoBanco(FALHA_DO_GATEWAY.error, FALHA_DO_GATEWAY.status);

  assert.equal("message" in causa, false, "a mensagem pode ser HTML ou ecoar valor de linha");
  assert.equal("details" in causa, false);
  assert.deepEqual(redactSensitive({ causaBanco: causa }).causaBanco, {
    codigo: "",
    statusHttp: 502
  });
});

test("o webhook registra a degradacao e a causa da falha", async () => {
  const rota = semComentarios(await source("app/api/pagamento/webhook/route.js"));

  assert.match(rota, /rateLimit\.degradado/);
  assert.match(rota, /"payment_webhook_limite_degradado"/);
  assert.match(rota, /"payment_webhook_falhou"/);
  assert.match(rota, /error\.causaBanco\.statusHttp/);
});

test("a marcacao do evento e a leitura da cobranca nao falham em silencio", async () => {
  const backend = semComentarios(await source("src/payments/payment-backend.js"));
  const cobranca = semComentarios(await source("src/payments/charge-flow.js"));

  assert.match(backend, /"payment_webhook_marcacao_falhou"/);
  assert.match(cobranca, /causaBanco: causaDoBanco\(error, statusHttp\)/);
});

test("as tres rotas de cobranca registram falha 5xx da loja", async () => {
  for (const metodo of ["pix", "cartao", "boleto"]) {
    const rota = semComentarios(await source(`app/api/pagamento/${metodo}/route.js`));

    assert.match(rota, /"payment_backend_failed"/, metodo);
  }
});

test("o Worker de producao pede placement smart", async () => {
  const config = JSON.parse((await source("wrangler.jsonc")).replace(/^\s*\/\/.*$/gm, ""));

  assert.deepEqual(config.placement, { mode: "smart" });
});
