import test from "node:test";
import assert from "node:assert/strict";

import {
  blockedMotorcycleKeywords,
  catalogProducts,
  getPublicCatalogProducts,
  getStorefrontMenu,
  rejectedCatalogProducts,
  validateCatalog
} from "../src/catalog/index.js";
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

test("catalog validation reports no implementation issues", () => {
  assert.deepEqual(validateCatalog(), []);
  assert.ok(blockedMotorcycleKeywords.length > 0);
});
