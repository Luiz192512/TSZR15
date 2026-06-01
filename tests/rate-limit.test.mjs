import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { redactSensitive } from "../src/lib/logger.js";
import {
  clearLocalRateLimitStore,
  consumeRateLimit,
  hashRateLimitIdentifier,
  rateLimitProfiles
} from "../src/lib/rate-limit.js";
import { createRateLimitResponse } from "../src/lib/rate-limit-response.js";

afterEach(() => {
  clearLocalRateLimitStore();
  delete process.env.VERCEL_ENV;
});

test("rate limit permite requisicoes dentro da janela e bloqueia acima do limite", async () => {
  const profile = {
    blockSeconds: 30,
    limit: 2,
    scope: "test-checkout",
    windowSeconds: 60
  };

  const first = await consumeRateLimit({ ...profile, identifier: "127.0.0.1", supabase: null });
  const second = await consumeRateLimit({ ...profile, identifier: "127.0.0.1", supabase: null });
  const third = await consumeRateLimit({ ...profile, identifier: "127.0.0.1", supabase: null });

  assert.equal(first.allowed, true);
  assert.equal(second.allowed, true);
  assert.equal(third.allowed, false);
  assert.equal(third.retryAfterSeconds, 30);
});

test("rate limit separa chaves por rota, IP e cupom", async () => {
  const profile = {
    blockSeconds: 30,
    limit: 1,
    scope: "coupon-a",
    windowSeconds: 60
  };

  await consumeRateLimit({ ...profile, identifier: "ip:cupom-a", supabase: null });
  const blockedSameKey = await consumeRateLimit({
    ...profile,
    identifier: "ip:cupom-a",
    supabase: null
  });
  const allowedDifferentCoupon = await consumeRateLimit({
    ...profile,
    identifier: "ip:cupom-b",
    supabase: null
  });
  const allowedDifferentRoute = await consumeRateLimit({
    ...profile,
    identifier: "ip:cupom-a",
    scope: "coupon-b",
    supabase: null
  });

  assert.equal(blockedSameKey.allowed, false);
  assert.equal(allowedDifferentCoupon.allowed, true);
  assert.equal(allowedDifferentRoute.allowed, true);
});

test("rate limit usa RPC Supabase com identificador hasheado", async () => {
  const calls = [];
  const supabase = {
    rpc(name, args) {
      calls.push({ args, name });
      return Promise.resolve({
        data: {
          allowed: true,
          count: 1,
          limit: 5,
          remaining: 4,
          retryAfterSeconds: 0
        },
        error: null
      });
    }
  };

  const result = await consumeRateLimit({
    ...rateLimitProfiles.adminLogin,
    identifier: "203.0.113.10:admin",
    increment: false,
    supabase
  });

  assert.equal(result.allowed, true);
  assert.equal(calls[0].name, "consume_rate_limit");
  assert.equal(calls[0].args.p_increment, false);
  assert.equal(calls[0].args.p_identifier_hash, hashRateLimitIdentifier("203.0.113.10:admin"));
});

test("rate limit falha fechado em runtime de producao sem Supabase", async () => {
  process.env.VERCEL_ENV = "production";

  const result = await consumeRateLimit({
    ...rateLimitProfiles.adminLogin,
    identifier: "203.0.113.10:admin",
    supabase: null
  });

  assert.equal(result.allowed, false);
  assert.equal(result.unavailable, true);
});

test("resposta HTTP de rate limit retorna 429 com retryAfterSeconds", async () => {
  const response = createRateLimitResponse(
    {
      allowed: false,
      retryAfterSeconds: 45,
      unavailable: false
    },
    { rateLimitedMessage: "Muitas tentativas de cupom." }
  );
  const body = await response.json();

  assert.equal(response.status, 429);
  assert.equal(response.headers.get("Retry-After"), "45");
  assert.deepEqual(body, {
    error: "Muitas tentativas de cupom.",
    retryAfterSeconds: 45
  });
});

test("resposta HTTP de rate limit retorna 503 quando o limitador esta indisponivel", async () => {
  const response = createRateLimitResponse({
    allowed: false,
    retryAfterSeconds: 60,
    unavailable: true
  });
  const body = await response.json();

  assert.equal(response.status, 503);
  assert.equal(body.retryAfterSeconds, 60);
});

test("logger redige dados sensiveis antes de registrar eventos", () => {
  const redacted = redactSensitive({
    customer: {
      email: "cliente@example.com",
      whatsapp: "11999999999"
    },
    metadata: {
      coupon: "R15OFF",
      token: "tszr15_admin_token"
    },
    route: "checkout"
  });

  assert.deepEqual(redacted, {
    customer: "[redacted]",
    metadata: {
      coupon: "R15OFF",
      token: "[redacted]"
    },
    route: "checkout"
  });
});
