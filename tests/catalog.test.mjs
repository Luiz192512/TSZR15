import test from "node:test";
import assert from "node:assert/strict";

import {
  blockedMotorcycleKeywords,
  catalogProducts,
  groupProductsByCategory,
  getPublicCatalogProducts,
  getStorefrontMenu,
  storefrontCategories,
  rejectedCatalogProducts,
  validateCatalog
} from "../src/catalog/index.js";
import {
  buildCatalogCategoryRows,
  buildCatalogProductCategoryRows,
  buildCatalogProductRows
} from "../src/catalog/supabase-rows.js";
import { buildCheckoutOrderDraft, CheckoutValidationError } from "../src/checkout/order-backend.js";
import {
  buildWhatsAppCheckoutUrl,
  buildWhatsAppOrderMessage,
  calculateCartTotals
} from "../src/checkout/whatsapp.js";
import {
  ASSISTED_PURCHASE_CONSENT_TEXT,
  buildAddressLine,
  buildCustomerSnapshot
} from "../src/customer/customer-data.js";
import {
  formatCepAddressLine,
  getCepDigits,
  normalizeViaCepAddress
} from "../src/customer/cep-lookup.js";
import { getSafeAuthRedirectPath } from "../src/auth/redirects.js";
import {
  CANONICAL_SITE_ORIGIN,
  buildPasswordResetRedirectUrl,
  getConfiguredSiteOrigin,
  getSiteOriginFromHeaders
} from "../src/auth/password-reset.js";
import { getUserDisplayName, getUserInitials } from "../src/auth/user-display.js";
import {
  getPublicSupabaseConfig,
  getSupabaseConfigStatus
} from "../src/lib/supabase/config.js";
import {
  createAdminSessionValue,
  isAdminPasswordValid,
  isAdminSessionValueFreshShape,
  isAdminSessionValueValid
} from "../src/admin/admin-session.js";
import { buildAdminOrderAnalytics } from "../src/admin/order-analytics.js";
import {
  isAdminSessionValueFreshShapeAtEdge,
  isAdminSessionValueValidAtEdge
} from "../src/admin/admin-session-edge.js";
import {
  isValidCep,
  isValidPhone,
  isValidState,
  isValidTaxId,
  sanitizeCep,
  sanitizePhone,
  sanitizeState,
  sanitizeTaxId
} from "../src/customer/field-validation.js";
import {
  getEffectiveInternalOrderStatus,
  getStatusLabel,
  internalOrderStatuses,
  operationalStatuses
} from "../src/orders/status.js";

const supabaseEnvKeys = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_URL",
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_ANON_KEY"
];

function withEnv(overrides, callback) {
  const previousValues = new Map(
    Object.keys(overrides).map((key) => [key, process.env[key]])
  );

  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    return callback();
  } finally {
    for (const [key, value] of previousValues.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

test("storefront menu keeps the five approved labels", () => {
  const labels = getStorefrontMenu().map((category) => category.label);

  assert.deepEqual(labels, [
    "Suporte & Sliders",
    "Estetica",
    "Escapamentos",
    "Adesivagem",
    "Manutencao"
  ]);
});

test("every published SKU has storefront categories, price, variations and WhatsApp channel", () => {
  for (const product of catalogProducts) {
    assert.ok(product.storefrontCategoryIds.length >= 1, `${product.name} sem categoria`);
    assert.ok(product.productFamily, `${product.name} sem familia tecnica`);
    assert.ok(product.priceCents > 0, `${product.name} sem preco`);
    assert.ok(product.variations.length >= 1, `${product.name} sem variacao`);
    assert.equal(product.checkoutChannel, "whatsapp-business");
    assert.equal(product.internalPurchaseSource.visibility, "internal-only");
  }
});

test("public catalog hides internal purchase metadata", () => {
  const publicProducts = getPublicCatalogProducts();

  assert.equal(publicProducts.length, catalogProducts.length);

  for (const product of publicProducts) {
    assert.equal("internalPurchaseSource" in product, false);
    assert.equal("internalPurchaseCandidates" in product, false);
    assert.equal("supplierSource" in product, false);
  }
});

test("Supabase catalog seed rows cover every published product", () => {
  const categoryRows = buildCatalogCategoryRows();
  const productRows = buildCatalogProductRows();
  const relationRows = buildCatalogProductCategoryRows();

  assert.equal(categoryRows.length, storefrontCategories.length);
  assert.equal(productRows.length, catalogProducts.length);
  assert.equal(new Set(productRows.map((product) => product.id)).size, catalogProducts.length);
  assert.equal(
    relationRows.length,
    catalogProducts.reduce((total, product) => total + product.storefrontCategoryIds.length, 0)
  );

  for (const product of productRows) {
    assert.ok(product.storefront_category_ids.length > 0);
    assert.ok(product.variations.length > 0);
    assert.ok(Array.isArray(product.image_urls));
    assert.equal(product.currency, "BRL");
    assert.equal(product.checkout_channel, "whatsapp-business");
    assert.equal(product.is_published, true);
  }
});

test("catalog products can carry image URL arrays through Supabase rows", () => {
  const [sampleProduct] = catalogProducts;
  const [row] = buildCatalogProductRows([
    {
      ...sampleProduct,
      imageUrls: [
        "https://cdn.example.com/r15/frente-1.jpg",
        "/brand/tszr15-hero-r15-dark.png"
      ]
    }
  ]);

  assert.deepEqual(row.image_urls, [
    "https://cdn.example.com/r15/frente-1.jpg",
    "/brand/tszr15-hero-r15-dark.png"
  ]);
});

test("catalog grouping creates carousel-ready category sections", () => {
  const groups = groupProductsByCategory(catalogProducts);
  const firstGroup = groups.find((group) => group.id === "suporte-sliders");

  assert.equal(groups.length, storefrontCategories.length);
  assert.ok(firstGroup.products.length > 0);
  assert.ok(firstGroup.products.every((product) => product.storefrontCategoryIds.includes(firstGroup.id)));
});

test("published catalog excludes vestuario and unsupported motorcycles", () => {
  const blockedNames = ["r3", "sbm 250s", "zx10", "vestuario"];

  for (const product of catalogProducts) {
    const searchable = product.name.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

    for (const token of blockedNames) {
      assert.equal(
        searchable.includes(token),
        false,
        `${product.name} deveria ter sido removido por conter ${token}`
      );
    }

    assert.deepEqual(product.bikeModelScope, ["yamaha-r15"]);
  }
});

test("catalog allows approved style-reference exceptions for R15", () => {
  const frenteR6 = catalogProducts.find((product) => product.name === "Frente R6");
  const hayabusa = catalogProducts.find((product) => product.name === "Hayabusa Adesivos Japones");

  assert.ok(frenteR6);
  assert.ok(hayabusa);
});

test("cross-listed products stay as single SKUs", () => {
  const filtro = catalogProducts.find((product) => product.name === "Filtro de AR Esportivo");
  const protetor = catalogProducts.find((product) => product.name === "Protetor de Tanque Completo");

  assert.deepEqual(filtro.storefrontCategoryIds, ["escapamentos", "manutencao"]);
  assert.deepEqual(protetor.storefrontCategoryIds, ["adesivagem", "estetica"]);
});

test("rejection reports keep only blocked items", () => {
  const rejectedNames = rejectedCatalogProducts.map((product) => product.name);

  assert.equal(rejectedNames.includes("Frente R6"), false);
  assert.equal(rejectedNames.includes("Hayabusa Adesivos Japones"), false);
  assert.ok(rejectedNames.includes("Retrovisor ZX10"));
  assert.ok(rejectedNames.includes("Kit Slider Yamaha R3"));
  assert.ok(rejectedNames.includes("Carenagem Frontal SBM 250s"));
  assert.ok(rejectedNames.includes("Camiseta Premium"));
});

test("WhatsApp checkout message carries items, payment method and total", () => {
  const cartItems = [
    {
      id: "slider",
      name: "Slider Esportivo em Aluminio Somente Slider",
      variation: "Preto",
      priceCents: 14990,
      quantity: 2
    }
  ];
  const totals = calculateCartTotals(cartItems, "pac-estimado");
  const message = buildWhatsAppOrderMessage({
    cartItems,
    customer: {
      email: "cliente@teste.com",
      name: "Cliente Teste",
      taxId: "123.456.789-00",
      phone: "(11) 99999-9999",
      whatsapp: "(11) 98888-7777",
      cep: "01001-000",
      address: "Rua Teste, 123 - Sao Paulo/SP"
    },
    paymentMethodId: "pix",
    shippingOptionId: "pac-estimado",
    storeName: "TSZR15"
  });
  const url = buildWhatsAppCheckoutUrl({ phoneNumber: "55 (11) 99999-9999", message });

  assert.equal(totals.totalCents, 33180);
  assert.match(message, /Pagamento escolhido: Pix/);
  assert.match(message, /Total: R\$\s*331,80/);
  assert.match(message, /Cliente: Cliente Teste/);
  assert.match(message, /CPF\/CNPJ: 123\.456\.789-00/);
  assert.match(message, /Email: cliente@teste\.com/);
  assert.match(message, /WhatsApp: \(11\) 98888-7777/);
  assert.match(message, /CEP: 01001-000/);
  assert.match(url, /^https:\/\/wa\.me\/5511999999999\?text=/);
});

test("backend checkout draft trusts catalog prices and creates order snapshots", () => {
  const draft = buildCheckoutOrderDraft(
    {
      cartItems: [
        {
          id: "slider-esportivo-em-aluminio-somente-slider",
          name: "Preco adulterado",
          priceCents: 1,
          quantity: 1,
          variation: "Preto"
        }
      ],
      customer: {
        address: "Rua Teste, 123 - Sao Paulo/SP",
        cep: "01001-000",
        email: "cliente@teste.com",
        name: "Cliente Teste",
        whatsapp: "(11) 98888-7777"
      },
      hasDataConsent: true,
      paymentMethodId: "pix",
      shippingOptionId: "combinar"
    },
    { storeName: "TSZR15" }
  );

  assert.equal(draft.totals.subtotalCents, 14990);
  assert.equal(draft.databaseItems[0].name, "Slider Esportivo em Aluminio Somente Slider");
  assert.equal(draft.databaseItems[0].unitPriceCents, 14990);
  assert.equal(draft.consentSnapshot.accepted, true);
  assert.match(draft.message, /Compra assistida/);
});

test("backend checkout draft rejects missing assisted-purchase consent", () => {
  assert.throws(
    () =>
      buildCheckoutOrderDraft({
        cartItems: [
          {
            id: "slider-esportivo-em-aluminio-somente-slider",
            quantity: 1,
            variation: "Preto"
          }
        ],
        customer: {
          address: "Rua Teste, 123 - Sao Paulo/SP",
          cep: "01001-000",
          name: "Cliente Teste",
          whatsapp: "(11) 98888-7777"
        },
        hasDataConsent: false,
        paymentMethodId: "pix",
        shippingOptionId: "combinar"
      }),
    CheckoutValidationError
  );
});

test("customer field validation rejects letters in numeric document and contact fields", () => {
  assert.equal(sanitizeTaxId("abc123.456.789-00xyz"), "123.456.789-00");
  assert.equal(sanitizePhone("(11) abc 98888-7777"), "(11)  98888-7777");
  assert.equal(sanitizeCep("01abc001-000"), "01001-000");
  assert.equal(sanitizeState("s1p"), "SP");

  assert.equal(isValidTaxId("123.456.789-00"), true);
  assert.equal(isValidTaxId("abc123"), false);
  assert.equal(isValidPhone("(11) 98888-7777"), true);
  assert.equal(isValidPhone("telefone"), false);
  assert.equal(isValidCep("01001-000"), true);
  assert.equal(isValidCep("cep-abc"), false);
  assert.equal(isValidState("SP"), true);
  assert.equal(isValidState("12"), false);
});

test("CEP lookup helpers normalize ViaCEP payloads", () => {
  const address = normalizeViaCepAddress({
    bairro: "Centro",
    cep: "01001-000",
    localidade: "Sao Paulo",
    logradouro: "Rua Teste",
    uf: "sp"
  });

  assert.deepEqual(address, {
    cep: "01001-000",
    city: "Sao Paulo",
    district: "Centro",
    state: "SP",
    street: "Rua Teste"
  });
  assert.equal(getCepDigits("01abc001-000"), "01001000");
  assert.equal(formatCepAddressLine(address), "Rua Teste - Centro - Sao Paulo/SP");
  assert.equal(normalizeViaCepAddress({ erro: true }), null);
});

test("backend checkout draft rejects invalid customer field formats", () => {
  let error;

  try {
    buildCheckoutOrderDraft({
        cartItems: [
          {
            id: "slider-esportivo-em-aluminio-somente-slider",
            quantity: 1,
            variation: "Preto"
          }
        ],
        customer: {
          address: "Rua Teste, 123 - Sao Paulo/SP",
          cep: "cep-abc",
          name: "Cliente Teste",
          taxId: "abc123",
          whatsapp: "telefone"
        },
        hasDataConsent: true,
        paymentMethodId: "pix",
        shippingOptionId: "combinar"
      });
  } catch (caughtError) {
    error = caughtError;
  }

  assert.ok(error instanceof CheckoutValidationError);
  assert.ok(error.details.some((detail) => detail.includes("CPF/CNPJ")));
  assert.ok(error.details.some((detail) => detail.includes("WhatsApp")));
  assert.ok(error.details.some((detail) => detail.includes("CEP")));
});

test("customer snapshot builds complete checkout data from account records", () => {
  const address = {
    cep: "80000-000",
    city: "Curitiba",
    complement: "Casa 2",
    district: "Centro",
    number: "50",
    reference_point: "Portao preto",
    state: "PR",
    street: "Rua XV"
  };
  const profile = {
    email: "cliente@tszr15.com",
    full_name: "Cliente TSZR15",
    phone: "",
    tax_id: "00.000.000/0001-00",
    whatsapp: "(41) 99999-9999"
  };
  const customer = buildCustomerSnapshot({ address, profile, user: { email: profile.email } });

  assert.equal(buildAddressLine(address), "Rua XV, 50 - Centro - Curitiba/PR - CEP 80000-000 - Casa 2 - Ref.: Portao preto");
  assert.equal(customer.name, "Cliente TSZR15");
  assert.equal(customer.email, "cliente@tszr15.com");
  assert.equal(customer.whatsapp, "(41) 99999-9999");
  assert.match(ASSISTED_PURCHASE_CONSENT_TEXT, /Autorizo a TSZR15/);
});

test("auth redirects only accept internal site paths", () => {
  assert.equal(getSafeAuthRedirectPath("/conta"), "/conta");
  assert.equal(getSafeAuthRedirectPath("/admin?pedido=TSZ-1"), "/admin?pedido=TSZ-1");
  assert.equal(getSafeAuthRedirectPath("/trocar-senha"), "/trocar-senha");
  assert.equal(getSafeAuthRedirectPath("https://evil.example"), "/conta");
  assert.equal(getSafeAuthRedirectPath("//evil.example"), "/conta");
  assert.equal(getSafeAuthRedirectPath("/entrar?next=/admin"), "/conta");
});

test("password reset callback URL stays on the configured site origin", () => {
  withEnv(
    {
      NEXT_PUBLIC_SITE_URL: "https://loja.tszr15.com/",
      SITE_URL: undefined,
      VERCEL_URL: undefined
    },
    () => {
      assert.equal(getConfiguredSiteOrigin(), "https://loja.tszr15.com");
      assert.equal(
        buildPasswordResetRedirectUrl(getConfiguredSiteOrigin()),
        "https://loja.tszr15.com/auth/callback?next=%2Ftrocar-senha"
      );
    }
  );
});

test("password reset origin falls back to the canonical production domain", () => {
  const headers = new Map([
    ["x-forwarded-host", "preview.tszr15.com"],
    ["x-forwarded-proto", "https"]
  ]);

  withEnv(
    {
      NEXT_PUBLIC_SITE_URL: undefined,
      SITE_URL: undefined,
      VERCEL_URL: undefined
    },
    () => {
      assert.equal(getConfiguredSiteOrigin(), CANONICAL_SITE_ORIGIN);
      assert.equal(getSiteOriginFromHeaders(headers), CANONICAL_SITE_ORIGIN);
      assert.equal(
        buildPasswordResetRedirectUrl(getSiteOriginFromHeaders(headers)),
        "https://www.tszr15-store.com.br/auth/callback?next=%2Ftrocar-senha"
      );
    }
  );
});

test("profile display helpers derive compact account initials", () => {
  const user = {
    email: "cliente.teste@example.com",
    user_metadata: {
      full_name: "Cliente TSZR15"
    }
  };

  assert.equal(getUserDisplayName(user), "Cliente TSZR15");
  assert.equal(getUserInitials(user), "CT");
  assert.equal(getUserInitials({ email: "cliente.teste@example.com" }), "CT");
});

test("Supabase config accepts public and hosted integration env names", () => {
  const emptyEnv = Object.fromEntries(supabaseEnvKeys.map((key) => [key, undefined]));

  withEnv(emptyEnv, () => {
    assert.equal(getPublicSupabaseConfig().isConfigured, false);
    assert.deepEqual(getSupabaseConfigStatus().missing, [
      "NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, SUPABASE_PUBLISHABLE_KEY ou SUPABASE_ANON_KEY"
    ]);
  });

  withEnv(
    {
      ...emptyEnv,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_public",
      NEXT_PUBLIC_SUPABASE_URL: "https://public-ref.supabase.co"
    },
    () => {
      const config = getPublicSupabaseConfig();

      assert.equal(config.isConfigured, true);
      assert.equal(config.projectRef, "public-ref");
      assert.equal(config.publishableKey, "sb_publishable_public");
    }
  );

  withEnv(
    {
      ...emptyEnv,
      SUPABASE_ANON_KEY: "anon-server-key",
      SUPABASE_URL: "https://server-ref.supabase.co"
    },
    () => {
      const config = getPublicSupabaseConfig();

      assert.equal(config.isConfigured, true);
      assert.equal(config.projectRef, "server-ref");
      assert.equal(config.publishableKey, "anon-server-key");
    }
  );
});

test("admin session values are signed, expiring and token-bound", async () => {
  const now = Date.UTC(2026, 4, 25, 12, 0, 0);
  const token = "admin-token-com-mais-de-12";
  const sessionValue = createAdminSessionValue({ now, token });

  assert.equal(isAdminPasswordValid(token, token), true);
  assert.equal(isAdminPasswordValid("token-errado", token), false);
  assert.equal(isAdminSessionValueFreshShape(sessionValue, { now: now + 1000 }), true);
  assert.equal(isAdminSessionValueValid(sessionValue, { now: now + 1000, token }), true);
  assert.equal(
    await isAdminSessionValueValidAtEdge(sessionValue, { now: now + 1000, token }),
    true
  );
  assert.equal(isAdminSessionValueFreshShapeAtEdge(sessionValue, { now: now + 1000 }), true);
  assert.equal(
    isAdminSessionValueValid(sessionValue, {
      now: now + 9 * 60 * 60 * 1000,
      token
    }),
    false
  );
  assert.equal(
    isAdminSessionValueValid(sessionValue, {
      now: now + 1000,
      token: "outro-token-com-mais-de-12"
    }),
    false
  );
  assert.equal(isAdminSessionValueValid("sha256-antigo-nao-assinado", { now, token }), false);
  assert.equal(
    await isAdminSessionValueValidAtEdge("sha256-antigo-nao-assinado", { now, token }),
    false
  );
  assert.equal(isAdminSessionValueFreshShape("sha256-antigo-nao-assinado", { now }), false);
});

test("catalog validation reports no implementation issues", () => {
  assert.deepEqual(validateCatalog(), []);
  assert.ok(blockedMotorcycleKeywords.length > 0);
});

test("tracking status labels stay customer-readable", () => {
  assert.equal(getStatusLabel("rastreio_recebido", operationalStatuses), "Rastreio recebido");
  assert.equal(getStatusLabel("em_transito", operationalStatuses), "Em transito");
  assert.equal(getStatusLabel("status_customizado", operationalStatuses), "Status Customizado");
});

test("internal order status becomes pending only after one day without a decision", () => {
  const now = new Date("2026-05-29T12:00:00.000Z");

  assert.equal(
    getEffectiveInternalOrderStatus(
      { created_at: "2026-05-29T08:00:00.000Z", internal_order_status: null },
      now
    ),
    ""
  );
  assert.equal(
    getEffectiveInternalOrderStatus(
      { created_at: "2026-05-28T11:59:59.000Z", internal_order_status: null },
      now
    ),
    "pendente"
  );
  assert.equal(
    getEffectiveInternalOrderStatus(
      { created_at: "2026-05-20T12:00:00.000Z", internal_order_status: "confirmado" },
      now
    ),
    "confirmado"
  );
  assert.equal(getStatusLabel("recusado", internalOrderStatuses), "Recusado");
});

test("admin analytics computes sales, profit and top customers", () => {
  const analytics = buildAdminOrderAnalytics({
    now: new Date("2026-05-29T12:00:00.000Z"),
    orders: [
      {
        id: "order-1",
        created_at: "2026-05-29T10:00:00.000Z",
        customer_name: "Cliente A",
        customer_whatsapp: "5511999999999",
        internal_order_status: "confirmado",
        operational_status: "enviado_whatsapp_business",
        payment_status: "aguardando_pagamento",
        total_cents: 20000
      },
      {
        id: "order-2",
        created_at: "2026-05-28T10:00:00.000Z",
        customer_name: "Cliente B",
        customer_whatsapp: "5511888888888",
        internal_order_status: "recusado",
        operational_status: "enviado_whatsapp_business",
        payment_status: "pagamento_confirmado",
        total_cents: 90000
      },
      {
        id: "order-3",
        created_at: "2026-05-29T09:00:00.000Z",
        customer_name: "Cliente A",
        customer_whatsapp: "5511999999999",
        internal_order_status: null,
        operational_status: "enviado_whatsapp_business",
        payment_status: "pagamento_confirmado",
        total_cents: 30000
      }
    ],
    supplierPurchases: [
      {
        order_id: "order-1",
        product_cost_cents: 8000,
        shipping_cost_cents: 2000
      },
      {
        order_id: "order-3",
        product_cost_cents: 10000,
        shipping_cost_cents: 3000
      }
    ]
  });

  assert.equal(analytics.salesCount, 2);
  assert.equal(analytics.totalRevenueCents, 50000);
  assert.equal(analytics.knownCostCents, 23000);
  assert.equal(analytics.grossProfitCents, 27000);
  assert.equal(analytics.topCustomers[0].name, "Cliente A");
  assert.equal(analytics.topCustomers[0].count, 2);
  assert.equal(analytics.internalStatusCounts.recusado, 1);
});
