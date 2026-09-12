import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAdminOrderOperationRpcArgs,
  saveAdminOrderOperation
} from "../src/admin/order-operation.js";

// Campos que pertencem a UMA compra na origem, e por isso ganham `__<indice>`.
// `trackingStatus`, `trackingDescription`, `trackingEventAt` e `trackingLocation`
// ficam de fora de proposito: eles descrevem o EVENTO de rastreio, que e do
// pedido, nao de uma compra.
const CAMPOS_DA_COMPRA = new Set([
  "carrier",
  "exchangeRate",
  "internalChannel",
  "operationalAccount",
  "productCost",
  "proofUrl",
  "purchasedAt",
  "shippingCost",
  "sourceEta",
  "sourceOrderNumber",
  "sourceProductUrl",
  "sourceStatus",
  "sourceStoreName",
  "supplierCurrency",
  "supplierNotes",
  "supplierPurchaseId",
  "trackingCode"
]);

function createOrderFormData(overrides = {}, blocos = 1) {
  const values = {
    assignedOperator: "Luiz",
    exchangeRate: "5,42",
    internalChannel: "shopee",
    operationalAccount: "conta-operacional",
    operationalStatus: "pagamento_confirmado",
    operationId: "1ad3361d-dbf1-4790-b03f-6808bf50979d",
    orderId: "90ca68f0-3613-4fe6-a68f-08b69c02de47",
    orderInternalNotes: "Separar embalagem reforcada.",
    orderNumber: "TSZ-20260712-ABC123",
    paymentProvider: "manual",
    paymentReference: "PIX-123",
    paymentStatus: "pagamento_confirmado",
    productCost: "199.90",
    proofUrl: "https://example.com/proof",
    purchasedAt: "2026-07-11T12:00",
    shippingCost: "20,00",
    sourceEta: "5 dias",
    sourceOrderNumber: "SOURCE-1",
    sourceProductUrl: "https://example.com/product",
    sourceStatus: "comprado",
    sourceStoreName: "Loja Teste",
    supplierCurrency: "BRL",
    supplierNotes: "Compra confirmada.",
    supplierPurchaseId: "58272342-ceb5-412b-a94d-88508892d235",
    trackingCode: "BR123",
    trackingDescription: "Objeto postado.",
    trackingEventAt: "2026-07-11T13:30",
    trackingLocation: "Sao Paulo",
    trackingStatus: "em_transito",
    carrier: "Correios",
    ...overrides
  };
  const formData = new FormData();

  for (const [key, value] of Object.entries(values)) {
    // Campos de compra na origem viajam com sufixo de indice: o pedido tem uma
    // compra POR LOJA, e o indice no nome e o que impede o custo de uma loja de
    // ser gravado na outra quando um campo condicional desloca a ordem.
    formData.set(CAMPOS_DA_COMPRA.has(key) ? `${key}__0` : key, value);
  }

  formData.set("supplierBlockCount", String(blocos));

  return formData;
}

// Acrescenta um segundo bloco de compra, para o caso de duas lojas no mesmo
// pedido.
function addSupplierBlock(formData, index, values) {
  for (const [key, value] of Object.entries(values)) {
    formData.set(`${key}__${index}`, value);
  }

  formData.set("supplierBlockCount", String(index + 1));

  return formData;
}

test("builds the complete atomic admin order RPC payload", () => {
  const args = buildAdminOrderOperationRpcArgs(createOrderFormData());

  assert.equal(args.p_order_id, "90ca68f0-3613-4fe6-a68f-08b69c02de47");
  assert.equal(args.p_order_number, "TSZ-20260712-ABC123");
  assert.equal(args.p_operation_id, "1ad3361d-dbf1-4790-b03f-6808bf50979d");
  assert.deepEqual(args.p_order, {
    assignedOperator: "Luiz",
    internalNotes: "Separar embalagem reforcada.",
    operationalStatus: "pagamento_confirmado",
    paymentStatus: "pagamento_confirmado"
  });
  assert.deepEqual(args.p_payment, {
    provider: "manual",
    providerReference: "PIX-123"
  });
  assert.equal(args.p_suppliers.length, 1);
  assert.equal(args.p_suppliers[0].productCostCents, 19990);
  assert.equal(args.p_suppliers[0].shippingCostCents, 2000);
  assert.equal(args.p_suppliers[0].purchasedAt, "2026-07-11T15:00:00.000Z");
  assert.equal(args.p_tracking.eventAt, "2026-07-11T16:30:00.000Z");
  assert.equal(args.p_tracking.status, "em_transito");
});

// Um pedido com itens de duas lojas vira duas compras. Se os campos se
// misturassem, o custo de uma loja seria gravado na outra — em silencio, e
// direto na conciliacao financeira.
test("dois blocos viram duas compras, cada uma com os proprios valores", () => {
  const formData = addSupplierBlock(createOrderFormData(), 1, {
    internalChannel: "aliexpress",
    productCost: "50,00",
    sourceStatus: "nao_comprado",
    sourceStoreName: "Beta Store",
    supplierCurrency: "BRL",
    supplierPurchaseId: ""
  });

  const args = buildAdminOrderOperationRpcArgs(formData);

  assert.equal(args.p_suppliers.length, 2);

  assert.equal(args.p_suppliers[0].sourceStoreName, "Loja Teste");
  assert.equal(args.p_suppliers[0].productCostCents, 19990);
  assert.equal(args.p_suppliers[0].id, "58272342-ceb5-412b-a94d-88508892d235");

  assert.equal(args.p_suppliers[1].sourceStoreName, "Beta Store");
  assert.equal(args.p_suppliers[1].productCostCents, 5000);
  assert.equal(args.p_suppliers[1].internalChannel, "aliexpress");
  // Bloco novo, ainda sem linha no banco.
  assert.equal(args.p_suppliers[1].id, null);
});

// O bloco extra "Nova compra na origem" fica vazio na maioria dos saves.
// Grava-lo criaria uma compra fantasma toda vez que o operador salvasse.
test("bloco vazio sem id e descartado", () => {
  const formData = createOrderFormData();
  formData.set("supplierBlockCount", "2");

  const args = buildAdminOrderOperationRpcArgs(formData);

  assert.equal(args.p_suppliers.length, 1);
});

// A mensagem precisa dizer QUAL bloco falhou: com tres lojas na tela, "status
// invalido" sozinho manda o operador procurar.
test("erro de validacao aponta o bloco", () => {
  const formData = addSupplierBlock(createOrderFormData(), 1, {
    sourceStatus: "status_que_nao_existe",
    sourceStoreName: "Beta Store"
  });

  assert.throws(() => buildAdminOrderOperationRpcArgs(formData), /\(bloco 2\)/i);
});

// Com varias compras, o evento de rastreio precisa dizer a qual envio pertence.
test("o evento de rastreio pode apontar para uma compra", () => {
  const formData = createOrderFormData();
  formData.set("trackingSupplierPurchaseId", "58272342-ceb5-412b-a94d-88508892d235");

  const args = buildAdminOrderOperationRpcArgs(formData);

  assert.equal(args.p_tracking.supplierPurchaseId, "58272342-ceb5-412b-a94d-88508892d235");
});

test("rejects invalid admin order dates instead of clearing them", () => {
  assert.throws(
    () => buildAdminOrderOperationRpcArgs(createOrderFormData({ purchasedAt: "invalid" })),
    /data da compra valida/i
  );
  assert.throws(
    () => buildAdminOrderOperationRpcArgs(createOrderFormData({ trackingEventAt: "invalid" })),
    /data do rastreio valida/i
  );
});

test("preserves custom tracking statuses accepted by the admin form", () => {
  const args = buildAdminOrderOperationRpcArgs(
    createOrderFormData({ trackingStatus: "retido_na_alfandega" })
  );

  assert.equal(args.p_tracking.status, "retido_na_alfandega");
});

test("requires an operation UUID so retries can be idempotent", () => {
  assert.throws(
    () => buildAdminOrderOperationRpcArgs(createOrderFormData({ operationId: "" })),
    /identificador da operacao invalido/i
  );
});

test("creates supplier data when only a meaningful source status is selected", () => {
  const args = buildAdminOrderOperationRpcArgs(
    createOrderFormData({
      carrier: "",
      exchangeRate: "",
      internalChannel: "",
      operationalAccount: "",
      productCost: "",
      proofUrl: "",
      purchasedAt: "",
      shippingCost: "",
      sourceEta: "",
      sourceOrderNumber: "",
      sourceProductUrl: "",
      sourceStatus: "comprado",
      sourceStoreName: "",
      supplierNotes: "",
      supplierPurchaseId: "",
      trackingCode: "",
      trackingDescription: "",
      trackingEventAt: "",
      trackingLocation: "",
      trackingStatus: ""
    })
  );

  assert.equal(args.p_suppliers[0].sourceStatus, "comprado");
});

test("creates tracking data when date or location is supplied", () => {
  const args = buildAdminOrderOperationRpcArgs(
    createOrderFormData({
      trackingDescription: "",
      trackingLocation: "Centro de distribuicao",
      trackingStatus: ""
    })
  );

  assert.equal(args.p_tracking.location, "Centro de distribuicao");
  assert.equal(args.p_tracking.eventAt, "2026-07-11T16:30:00.000Z");
});

test("calls the atomic RPC and returns its canonical order number", async () => {
  const args = { p_order_id: "order-id" };
  const calls = [];
  const supabase = {
    async rpc(name, payload) {
      calls.push([name, payload]);
      return {
        data: {
          orderNumber: "TSZ-CANONICAL",
          // Plural: o save toca uma compra POR LOJA do pedido.
          supplierPurchaseIds: ["supplier-alfa", "supplier-beta"]
        },
        error: null
      };
    }
  };

  const result = await saveAdminOrderOperation({ args, supabase });

  assert.deepEqual(calls, [["save_admin_order_operation", args]]);
  assert.deepEqual(result, {
    orderNumber: "TSZ-CANONICAL",
    supplierPurchaseIds: ["supplier-alfa", "supplier-beta"]
  });
});
