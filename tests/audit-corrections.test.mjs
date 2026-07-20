import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import * as adminSession from "../src/admin/admin-session.js";
import * as adminSessionEdge from "../src/admin/admin-session-edge.js";
import * as coupons from "../src/checkout/coupons.js";

async function importOptional(path) {
  try {
    return await import(path);
  } catch (error) {
    if (error?.code === "ERR_MODULE_NOT_FOUND") {
      return {};
    }

    throw error;
  }
}

test("politica de senha replica tamanho e composicao exigidos pelo Supabase", async () => {
  const passwordPolicy = await importOptional("../src/auth/password-policy.js");

  assert.equal(passwordPolicy.MIN_CUSTOMER_PASSWORD_LENGTH, 8);
  assert.equal(
    passwordPolicy.getCustomerPasswordError("Aa12345"),
    "Use uma senha com pelo menos 8 caracteres."
  );
  assert.equal(
    passwordPolicy.getCustomerPasswordError("abcdefgh"),
    "Use pelo menos uma letra minuscula, uma maiuscula e um numero."
  );
  assert.equal(
    passwordPolicy.getCustomerPasswordError("ABCDEFG1"),
    "Use pelo menos uma letra minuscula, uma maiuscula e um numero."
  );
  assert.equal(
    passwordPolicy.getCustomerPasswordError("Abcdefgh"),
    "Use pelo menos uma letra minuscula, uma maiuscula e um numero."
  );
  assert.equal(passwordPolicy.getCustomerPasswordError("Senha123"), "");
});

test("token administrativo exige pelo menos 32 caracteres", () => {
  assert.equal(adminSession.isAdminTokenValueConfigured("a".repeat(31)), false);
  assert.equal(adminSession.isAdminTokenValueConfigured("a".repeat(32)), true);
  assert.equal(adminSessionEdge.isAdminTokenValueConfiguredAtEdge("a".repeat(31)), false);
  assert.equal(adminSessionEdge.isAdminTokenValueConfiguredAtEdge("a".repeat(32)), true);
});

test("cookie administrativo sempre usa Secure", () => {
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "test";

  try {
    assert.equal(adminSession.getAdminSessionCookieOptions().secure, true);
    assert.equal(adminSessionEdge.getAdminSessionCookieOptions().secure, true);
  } finally {
    if (previousNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previousNodeEnv;
    }
  }
});

test("origem administrativa exige Origin e Host iguais", async () => {
  const originPolicy = await importOptional("../src/security/origin.js");

  assert.equal(typeof originPolicy.isSameOriginRequest, "function");
  assert.equal(originPolicy.isSameOriginRequest(new Headers()), false);
  assert.equal(
    originPolicy.isSameOriginRequest(
      new Headers({ host: "www.tszr15-store.com.br", origin: "https://www.tszr15-store.com.br" })
    ),
    true
  );
  assert.equal(
    originPolicy.isSameOriginRequest(
      new Headers({ host: "www.tszr15-store.com.br", origin: "https://evil.example" })
    ),
    false
  );
});

test("checkout exige mesma origem e corpo JSON", async () => {
  const originPolicy = await importOptional("../src/security/origin.js");
  const checkoutRoute = await readFile(
    new URL("../app/api/checkout/whatsapp/route.js", import.meta.url),
    "utf8"
  );

  assert.equal(typeof originPolicy.isJsonRequest, "function");
  assert.equal(
    originPolicy.isJsonRequest(new Headers({ "content-type": "application/json; charset=utf-8" })),
    true
  );
  assert.equal(originPolicy.isJsonRequest(new Headers({ "content-type": "text/plain" })), false);
  assert.match(checkoutRoute, /if \(!isSameOriginRequest\(request\)\)/);
  assert.match(checkoutRoute, /if \(!isJsonRequest\(request\)\)/);
});

test("vinculo de pedido convidado aceita apenas o primeiro usuario concorrente", async () => {
  const orderClaim = await importOptional("../src/reviews/order-claim.js");
  const orderReviewsSource = await readFile(
    new URL("../src/reviews/order-reviews.js", import.meta.url),
    "utf8"
  );
  let ownerId = null;

  function supabaseForClaim() {
    let nextOwnerId = null;
    const builder = {
      eq: () => builder,
      is: () => builder,
      maybeSingle: async () => {
        if (ownerId !== null) return { data: null, error: null };
        ownerId = nextOwnerId;
        return { data: { id: "order-1" }, error: null };
      },
      select: () => builder,
      update: ({ user_id: userId }) => {
        nextOwnerId = userId;
        return builder;
      }
    };

    return { from: () => builder };
  }

  assert.equal(typeof orderClaim.claimUnownedOrder, "function");
  const first = await orderClaim.claimUnownedOrder({
    orderId: "order-1",
    supabase: supabaseForClaim(),
    userId: "user-a"
  });
  const second = await orderClaim.claimUnownedOrder({
    orderId: "order-1",
    supabase: supabaseForClaim(),
    userId: "user-b"
  });

  assert.equal(first, true);
  assert.equal(second, false);
  assert.equal(ownerId, "user-a");
  assert.match(orderReviewsSource, /claimUnownedOrder\(\{/);
});

test("rastreio envia pedido e contato por POST sem gravar PII na URL", async () => {
  const pageSource = await readFile(new URL("../app/rastreio/page.js", import.meta.url), "utf8");
  const actionSource = await readFile(
    new URL("../app/rastreio/actions.js", import.meta.url),
    "utf8"
  );
  const lookupSource = await readFile(
    new URL("../src/components/tracking/tracking-lookup.js", import.meta.url),
    "utf8"
  );

  assert.doesNotMatch(pageSource, /searchParams|params\?\.contato|method="GET"/);
  assert.match(pageSource, /<TrackingLookup\s*\/>/);
  assert.match(actionSource, /findPublicOrderTracking\(\{/);
  assert.match(lookupSource, /useActionState\(lookupOrderTracking/);
  assert.match(lookupSource, /<form[\s\S]*?action=\{formAction\}/);
});

test("rastreio publico aplica limite por IP antes de consultar pedidos", async () => {
  const rateLimit = await importOptional("../src/lib/rate-limit.js");
  const actionSource = await readFile(
    new URL("../app/rastreio/actions.js", import.meta.url),
    "utf8"
  );

  assert.deepEqual(rateLimit.rateLimitProfiles.tracking, {
    blockSeconds: 5 * 60,
    limit: 10,
    scope: "public-order-tracking",
    windowSeconds: 5 * 60
  });
  assert.match(actionSource, /consumeRateLimit\(\{[\s\S]*rateLimitProfiles\.tracking/);
  assert.match(actionSource, /identifier: getRequestIp\(headerStore\)/);
  assert.match(actionSource, /if \(!rateLimit\.allowed\)/);
});

test("checkout e rastreio nao devolvem mensagens internas do banco ao cliente", async () => {
  const checkoutSource = await readFile(
    new URL("../app/api/checkout/whatsapp/route.js", import.meta.url),
    "utf8"
  );
  const trackingActionSource = await readFile(
    new URL("../app/rastreio/actions.js", import.meta.url),
    "utf8"
  );

  assert.doesNotMatch(
    checkoutSource,
    /errorResponse\(`Nao foi possivel salvar o pedido: \$\{error\.message\}`/
  );
  assert.match(
    checkoutSource,
    /return errorResponse\("Nao foi possivel salvar o pedido\. Tente novamente\.", 500\)/
  );
  assert.doesNotMatch(
    trackingActionSource,
    /message: error instanceof Error \? error\.message/
  );
  assert.match(trackingActionSource, /logServerEvent\("error", "tracking_lookup_failed"/);
});

test("edicao de review valida todas as fotos antes de substituir as atuais", async () => {
  const photoReplacement = await importOptional("../src/reviews/review-photo-replacement.js");
  const orderReviewsSource = await readFile(
    new URL("../src/reviews/order-reviews.js", import.meta.url),
    "utf8"
  );
  let storageCalls = 0;
  let databaseCalls = 0;
  const supabase = {
    from: () => {
      databaseCalls += 1;
      throw new Error("Banco nao deveria ser acessado antes da validacao completa.");
    },
    storage: {
      from: () => {
        storageCalls += 1;
        throw new Error("Storage nao deveria ser acessado antes da validacao completa.");
      }
    }
  };
  const files = [
    {
      arrayBuffer: async () => Uint8Array.from([0xff, 0xd8, 0xff, 0x00]).buffer,
      size: 4,
      type: "image/jpeg"
    },
    {
      arrayBuffer: async () => Uint8Array.from([0x00, 0x01, 0x02, 0x03]).buffer,
      size: 4,
      type: "image/jpeg"
    }
  ];

  assert.equal(typeof photoReplacement.replaceReviewPhotos, "function");
  await assert.rejects(
    photoReplacement.replaceReviewPhotos({
      files,
      reviewId: "review-1",
      supabase,
      userId: "user-1"
    }),
    /Envie fotos JPG, PNG, WEBP ou GIF/
  );
  assert.equal(storageCalls, 0);
  assert.equal(databaseCalls, 0);
  assert.match(orderReviewsSource, /replaceReviewPhotos\(\{/);
});

test("carrinho local e isolado por usuario no mesmo navegador", async () => {
  const cartStorage = await importOptional("../src/cart/cart-storage.js");
  const useCartSource = await readFile(
    new URL("../src/components/catalog/hooks/use-cart.js", import.meta.url),
    "utf8"
  );

  assert.equal(cartStorage.getCartStorageKey(), "tszr15-cart");
  assert.equal(cartStorage.getCartStorageKey("user-a"), "tszr15-cart:user:user-a");
  assert.equal(cartStorage.getCartStorageKey("user-b"), "tszr15-cart:user:user-b");
  assert.notEqual(cartStorage.getCartStorageKey("user-a"), cartStorage.getCartStorageKey("user-b"));
  assert.match(useCartSource, /readStoredCart\(resolvedUserId\)/);
  assert.match(useCartSource, /loadedCartUserId !== resolvedUserId/);
  assert.doesNotMatch(useCartSource, /readStoredCart\(\)/);
  assert.equal(typeof cartStorage.migrateGuestCartToUser, "function");
  assert.ok(
    useCartSource.indexOf("migrateGuestCartToUser(resolvedUserId)") >= 0 &&
      useCartSource.indexOf("migrateGuestCartToUser(resolvedUserId)") <
        useCartSource.indexOf("readStoredCart(resolvedUserId)"),
    "o hook deve migrar o carrinho de convidado antes de carregar o carrinho do usuario"
  );
});

test("cadastro confirmado remove usuario auth quando dados secundarios falham", async () => {
  const compensation = await importOptional("../src/auth/signup-compensation.js");
  const authActionSource = await readFile(
    new URL("../app/auth/actions.js", import.meta.url),
    "utf8"
  );
  const deleteUser = async (userId) => ({ data: { user: { id: userId } }, error: null });
  const adminSupabase = { auth: { admin: { deleteUser } } };

  assert.equal(typeof compensation.rollbackCreatedCustomerAuthUser, "function");
  const result = await compensation.rollbackCreatedCustomerAuthUser({
    adminSupabase,
    userId: "user-new"
  });

  assert.equal(result.error, null);
  assert.match(
    authActionSource,
    /if \(persistenceError\) \{[\s\S]*rollbackCreatedCustomerAuthUser\(\{[\s\S]*userId: data\.user\.id/
  );
});

test("checkout nao usa numero ficticio quando WhatsApp nao esta configurado", async () => {
  const whatsappConfig = await importOptional("../src/checkout/whatsapp-config.js");
  const checkoutSource = await readFile(
    new URL("../app/api/checkout/whatsapp/route.js", import.meta.url),
    "utf8"
  );

  assert.equal(whatsappConfig.getConfiguredWhatsAppNumber({}), "");
  assert.equal(
    whatsappConfig.getConfiguredWhatsAppNumber({ WHATSAPP_BUSINESS_NUMBER: "5511999999999" }),
    "5511999999999"
  );
  assert.doesNotMatch(checkoutSource, /"5511999999999"/);
  assert.match(checkoutSource, /if \(!phoneNumber\) \{/);
  assert.ok(checkoutSource.indexOf("if (!phoneNumber)") < checkoutSource.indexOf("persistCheckoutOrder({"));
});

test("analytics admin limita custos e itens ao mesmo conjunto de pedidos", async () => {
  const orderAdminSource = await readFile(
    new URL("../src/admin/order-admin.js", import.meta.url),
    "utf8"
  );

  assert.match(orderAdminSource, /const orderIds = \(orders \?\? \[\]\)\.map/);
  assert.match(
    orderAdminSource,
    /\.from\("supplier_purchases"\)[\s\S]*?\.in\("order_id", orderIds\)/
  );
  assert.match(
    orderAdminSource,
    /\.from\("order_items"\)[\s\S]*?\.in\("order_id", orderIds\)/
  );
});

test("datas de analytics e rastreio usam explicitamente America Sao Paulo", async () => {
  const brasiliaDate = await importOptional("../src/lib/brasilia-date.js");
  const trackingSource = await readFile(
    new URL("../src/components/tracking/tracking-lookup.js", import.meta.url),
    "utf8"
  );

  assert.equal(
    brasiliaDate.getBrasiliaDateKey("2026-07-20T02:30:00.000Z"),
    "2026-07-19"
  );
  assert.match(
    brasiliaDate.formatBrasiliaDateTime("2026-07-20T02:30:00.000Z"),
    /19\/07\/2026.*23:30/
  );
  assert.match(trackingSource, /formatBrasiliaDateTime\(value\)/);
});

test("layout Cloudflare nao injeta endpoints exclusivos da Vercel", async () => {
  const layoutSource = await readFile(new URL("../app/layout.js", import.meta.url), "utf8");

  assert.doesNotMatch(layoutSource, /@vercel\/analytics|@vercel\/speed-insights/);
  assert.doesNotMatch(layoutSource, /<Analytics\s*\/>|<SpeedInsights\s*\/>/);
});

test("cupom publico omite descricao e segmentacao internas", () => {
  assert.equal(typeof coupons.toPublicCheckoutCoupon, "function");

  const publicCoupon = coupons.toPublicCheckoutCoupon({
    appliesToCategoryIds: ["escapamentos"],
    appliesToProductIds: ["escape-r15"],
    code: "R15OFF",
    description: "Campanha interna",
    discountCents: 1500,
    discountPercent: 10,
    discountType: "percent"
  });

  assert.deepEqual(publicCoupon, {
    code: "R15OFF",
    discountCents: 1500,
    discountPercent: 10,
    discountType: "percent"
  });
});

test("totais publicos do checkout omitem snapshot interno do cupom", async () => {
  const publicCheckout = await importOptional("../src/checkout/public-response.js");
  const publicTotals = publicCheckout.toPublicCheckoutTotals?.({
    currency: "BRL",
    discountCents: 1500,
    discountSnapshot: {
      code: "R15OFF",
      description: "Campanha interna"
    },
    shippingCents: 2000,
    subtotalCents: 15000,
    totalCents: 15500
  });

  assert.deepEqual(publicTotals, {
    currency: "BRL",
    discountCents: 1500,
    shippingCents: 2000,
    subtotalCents: 15000,
    totalCents: 15500
  });
});

test("limitador global de cupom independe do codigo testado", () => {
  assert.equal(typeof coupons.getCouponRateLimitIdentifiers, "function");

  const first = coupons.getCouponRateLimitIdentifiers({
    couponCode: "R15OFF",
    ip: "203.0.113.10"
  });
  const second = coupons.getCouponRateLimitIdentifiers({
    couponCode: "OUTRO",
    ip: "203.0.113.10"
  });

  assert.equal(first.global, second.global);
  assert.notEqual(first.code, second.code);
});

test("contato de pedido exige igualdade canonica completa", async () => {
  const orderContact = await importOptional("../src/customer/order-contact.js");
  const order = {
    customer_phone: "(11) 98888-7777",
    customer_snapshot: {},
    customer_tax_id: "123.456.789-00",
    customer_whatsapp: "+55 (11) 99999-1234"
  };

  assert.equal(typeof orderContact.contactMatchesOrder, "function");
  assert.equal(orderContact.contactMatchesOrder(order, "11 99999-1234"), true);
  assert.equal(orderContact.contactMatchesOrder(order, "12345678900"), true);
  assert.equal(orderContact.contactMatchesOrder(order, "21 99999-1234"), false);
  assert.equal(orderContact.contactMatchesOrder(order, "99991234"), false);
});

test("fotos de review sao assinadas em lote por bucket", async () => {
  const photoUrls = await importOptional("../src/reviews/photo-urls.js");
  const calls = [];
  const supabase = {
    storage: {
      from(bucket) {
        return {
          async createSignedUrls(paths, expiresIn) {
            calls.push({ bucket, expiresIn, paths });
            return {
              data: paths.map((path) => ({ error: null, path, signedUrl: `https://cdn/${path}` })),
              error: null
            };
          }
        };
      }
    }
  };
  const photos = [
    { id: "1", review_id: "r1", sort_order: 1, storage_bucket: "reviews", storage_path: "r1/b.webp" },
    { id: "2", review_id: "r1", sort_order: 0, storage_bucket: "reviews", storage_path: "r1/a.webp" },
    { id: "3", review_id: "r2", sort_order: 0, storage_bucket: "legacy", storage_path: "r2/a.webp" }
  ];

  assert.equal(typeof photoUrls.createSignedPhotoUrls, "function");
  const signed = await photoUrls.createSignedPhotoUrls({ photos, supabase });

  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0], {
    bucket: "reviews",
    expiresIn: 60 * 60 * 24 * 7,
    paths: ["r1/b.webp", "r1/a.webp"]
  });
  assert.deepEqual(
    signed.map(({ id, reviewId, sortOrder, url }) => ({ id, reviewId, sortOrder, url })),
    [
      { id: "1", reviewId: "r1", sortOrder: 1, url: "https://cdn/r1/b.webp" },
      { id: "2", reviewId: "r1", sortOrder: 0, url: "https://cdn/r1/a.webp" },
      { id: "3", reviewId: "r2", sortOrder: 0, url: "https://cdn/r2/a.webp" }
    ]
  );
});

test("consulta de vitrine filtra e pagina no servidor", async () => {
  const storefrontQuery = await importOptional("../src/catalog/storefront-query.js");
  const products = Array.from({ length: 15 }, (_, index) => ({
    id: `produto-${index + 1}`,
    name: index === 14 ? "Escape Especial" : `Produto ${String(index + 1).padStart(2, "0")}`,
    priceCents: (index + 1) * 1000,
    productFamily: index % 2 === 0 ? "escapamento" : "slider",
    storefrontCategoryIds: [index % 2 === 0 ? "escapamentos" : "suporte-sliders"],
    variations: [index % 2 === 0 ? "Preto" : "Vermelho"]
  }));

  assert.equal(typeof storefrontQuery.getStorefrontCatalogPage, "function");
  const result = storefrontQuery.getStorefrontCatalogPage(products, {
    category: "escapamentos",
    page: 2,
    pageSize: 3,
    sort: "menor-preco"
  });

  assert.equal(result.total, 8);
  assert.equal(result.page, 2);
  assert.equal(result.pageCount, 3);
  assert.deepEqual(result.products.map((product) => product.id), ["produto-7", "produto-9", "produto-11"]);

  const searched = storefrontQuery.getStorefrontCatalogPage(products, { query: "escape especial" });
  assert.deepEqual(searched.products.map((product) => product.id), ["produto-15"]);
});
