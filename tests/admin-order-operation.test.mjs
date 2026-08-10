import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAdminOrderOperationRpcArgs,
  saveAdminOrderOperation,
} from "../src/admin/order-operation.js";

function createOrderFormData(overrides = {}) {
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
    ...overrides,
  };
  const formData = new FormData();

  for (const [key, value] of Object.entries(values)) {
    formData.set(key, value);
  }

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
    paymentStatus: "pagamento_confirmado",
    // Campos de ajuste ausentes no formulario viram "" e a RPC limpa o override.
    settledCostCents: "",
    settledTotalCents: "",
  });
  assert.deepEqual(args.p_payment, {
    provider: "manual",
    providerReference: "PIX-123",
  });
  assert.equal(args.p_supplier.productCostCents, 19990);
  assert.equal(args.p_supplier.shippingCostCents, 2000);
  assert.equal(args.p_supplier.purchasedAt, "2026-07-11T15:00:00.000Z");
  assert.equal(args.p_tracking.eventAt, "2026-07-11T16:30:00.000Z");
  assert.equal(args.p_tracking.status, "em_transito");
});

test("rejects invalid admin order dates instead of clearing them", () => {
  assert.throws(
    () =>
      buildAdminOrderOperationRpcArgs(
        createOrderFormData({ purchasedAt: "invalid" }),
      ),
    /data da compra valida/i,
  );
  assert.throws(
    () =>
      buildAdminOrderOperationRpcArgs(
        createOrderFormData({ trackingEventAt: "invalid" }),
      ),
    /data do rastreio valida/i,
  );
});

test("preserves custom tracking statuses accepted by the admin form", () => {
  const args = buildAdminOrderOperationRpcArgs(
    createOrderFormData({ trackingStatus: "retido_na_alfandega" }),
  );

  assert.equal(args.p_tracking.status, "retido_na_alfandega");
});

test("requires an operation UUID so retries can be idempotent", () => {
  assert.throws(
    () =>
      buildAdminOrderOperationRpcArgs(createOrderFormData({ operationId: "" })),
    /identificador da operacao invalido/i,
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
      trackingStatus: "",
    }),
  );

  assert.equal(args.p_supplier.sourceStatus, "comprado");
});

test("creates tracking data when date or location is supplied", () => {
  const args = buildAdminOrderOperationRpcArgs(
    createOrderFormData({
      trackingDescription: "",
      trackingLocation: "Centro de distribuicao",
      trackingStatus: "",
    }),
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
          supplierPurchaseId: "supplier-id",
        },
        error: null,
      };
    },
  };

  const result = await saveAdminOrderOperation({ args, supabase });

  assert.deepEqual(calls, [["save_admin_order_operation", args]]);
  assert.deepEqual(result, {
    orderNumber: "TSZ-CANONICAL",
    supplierPurchaseId: "supplier-id",
  });
});
