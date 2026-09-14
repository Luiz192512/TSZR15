import { parseAdminDateTimeInput, parseAdminMoneyToCents } from "./admin-form-values.js";
import { logServerEvent } from "../lib/logger.js";
import { recomputeLedger } from "../payments/ledger-reconciliation.js";
import { notifyCustomerOfConfirmedPurchase } from "../payments/purchase-confirmation.js";
import {
  isKnownStatus,
  operationalStatuses,
  paymentStatuses,
  supplierSourceStatuses
} from "../orders/status.js";

function cleanString(value, maxLength = 500) {
  return String(value ?? "")
    .trim()
    .slice(0, maxLength);
}

function cleanNullable(value, maxLength = 500) {
  return cleanString(value, maxLength) || null;
}

function parseOptionalMoney(formData, key, label) {
  const rawValue = cleanString(formData.get(key), 40);

  if (!rawValue) {
    return null;
  }

  const cents = parseAdminMoneyToCents(rawValue, { allowZero: true });

  if (!Number.isInteger(cents)) {
    throw new Error(`Informe ${label} valido.`);
  }

  return cents;
}

function parseOptionalDate(formData, key, label) {
  const rawValue = cleanString(formData.get(key), 80);

  if (!rawValue) {
    return null;
  }

  const value = parseAdminDateTimeInput(rawValue);

  if (!value) {
    throw new Error(`Informe ${label} valida no horario de Brasilia.`);
  }

  return value;
}

function parseOptionalNumber(value) {
  const cleaned = cleanString(value, 40).replace(",", ".");

  if (!cleaned) {
    return null;
  }

  const numeric = Number(cleaned);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
}

function hasSupplierPayload(payload) {
  return Object.entries(payload).some(([key, value]) => {
    if (key === "currency" || key === "id") {
      return false;
    }

    if (key === "sourceStatus") {
      return value !== "nao_comprado";
    }

    return value !== null && value !== "";
  });
}

// Campos de cada bloco vêm com sufixo de índice: `sourceStatus__0`,
// `productCost__1`.
//
// Sufixo, e não `formData.getAll()` posicional, de propósito: um campo
// condicional ou um `<select>` desabilitado desloca todo o array em silêncio, e
// o custo de uma loja acabaria gravado na outra. Com o índice no nome, o
// pareamento entre campo e compra é explícito.
function indexed(formData, name, index) {
  return formData.get(`${name}__${index}`);
}

/**
 * Lê os N blocos de origem interna do formulário.
 *
 * Um pedido vira uma compra POR LOJA, então o formulário tem um bloco por
 * compra existente mais um vazio para o operador dividir à mão.
 */
function collectSuppliers(formData) {
  const total = Number.parseInt(String(formData.get("supplierBlockCount") ?? "0"), 10);
  const suppliers = [];

  if (!Number.isInteger(total) || total <= 0) {
    return suppliers;
  }

  for (let index = 0; index < total; index += 1) {
    // Erro de um bloco precisa dizer QUAL bloco: com três lojas na tela, "custo
    // invalido" sozinho manda o operador procurar em qual delas. O sufixo vai
    // no fim da frase para as mensagens continuarem lendo como português.
    const supplier = comBloco(index, () => readSupplierBlock(formData, index));

    // Bloco vazio e sem id é o "Nova compra na origem" que o operador não
    // preencheu. Gravá-lo criaria uma compra fantasma a cada save.
    if (supplier.id || hasSupplierPayload(supplier)) {
      suppliers.push(supplier);
    }
  }

  return suppliers;
}

function comBloco(index, ler) {
  try {
    return ler();
  } catch (error) {
    // `cause` preserva o erro original: sem ele, a pilha da falha real some e
    // sobra só a mensagem reescrita.
    throw new Error(`${error.message} (bloco ${index + 1})`, { cause: error });
  }
}

function readSupplierBlock(formData, index) {
  const sourceStatus = cleanString(indexed(formData, "sourceStatus", index), 80) || "nao_comprado";

  if (!isKnownStatus(sourceStatus, supplierSourceStatuses)) {
    throw new Error("Status da origem invalido.");
  }

  return {
    carrier: cleanNullable(indexed(formData, "carrier", index), 120),
    currency: cleanString(indexed(formData, "supplierCurrency", index), 12) || "BRL",
    exchangeRate: parseOptionalNumber(indexed(formData, "exchangeRate", index)),
    id: cleanNullable(indexed(formData, "supplierPurchaseId", index), 80),
    internalChannel: cleanNullable(indexed(formData, "internalChannel", index), 80),
    internalNotes: cleanNullable(indexed(formData, "supplierNotes", index), 1800),
    operationalAccount: cleanNullable(indexed(formData, "operationalAccount", index), 160),
    productCostCents: parseOptionalMoney(formData, `productCost__${index}`, "um custo de produto"),
    proofUrl: cleanNullable(indexed(formData, "proofUrl", index), 600),
    purchasedAt: parseOptionalDate(formData, `purchasedAt__${index}`, "uma data da compra"),
    shippingCostCents: parseOptionalMoney(formData, `shippingCost__${index}`, "um custo de frete"),
    sourceEta: cleanNullable(indexed(formData, "sourceEta", index), 160),
    sourceOrderNumber: cleanNullable(indexed(formData, "sourceOrderNumber", index), 180),
    sourceProductUrl: cleanNullable(indexed(formData, "sourceProductUrl", index), 900),
    sourceStatus,
    sourceStoreName: cleanNullable(indexed(formData, "sourceStoreName", index), 180),
    trackingCode: cleanNullable(indexed(formData, "trackingCode", index), 180)
  };
}

export function buildAdminOrderOperationRpcArgs(formData) {
  const orderId = cleanString(formData.get("orderId"), 80);
  const orderNumber = cleanString(formData.get("orderNumber"), 80);
  const operationId = cleanString(formData.get("operationId"), 80);
  const paymentStatus = cleanString(formData.get("paymentStatus"), 80);
  const operationalStatus = cleanString(formData.get("operationalStatus"), 80);
  const trackingStatus = cleanNullable(formData.get("trackingStatus"), 120);

  if (!orderId) {
    throw new Error("Pedido invalido.");
  }

  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(operationId)
  ) {
    throw new Error("Identificador da operacao invalido.");
  }

  if (!isKnownStatus(paymentStatus, paymentStatuses)) {
    throw new Error("Status de pagamento invalido.");
  }

  if (!isKnownStatus(operationalStatus, operationalStatuses)) {
    throw new Error("Status operacional invalido.");
  }

  const suppliers = collectSuppliers(formData);
  const trackingDescription = cleanNullable(formData.get("trackingDescription"), 900);
  const trackingLocation = cleanNullable(formData.get("trackingLocation"), 160);
  const trackingEventAt = parseOptionalDate(formData, "trackingEventAt", "uma data do rastreio");
  const tracking =
    trackingStatus || trackingDescription || trackingEventAt || trackingLocation
      ? {
          description: trackingDescription,
          eventAt: trackingEventAt,
          location: trackingLocation,
          status: trackingStatus || operationalStatus,
          // A qual envio o evento pertence. Sem isto, com duas lojas, ele
          // grudava na compra que por acaso veio depois no formulário.
          supplierPurchaseId: cleanNullable(formData.get("trackingSupplierPurchaseId"), 80)
        }
      : null;

  return {
    p_order: {
      assignedOperator: cleanNullable(formData.get("assignedOperator"), 120),
      internalNotes: cleanNullable(formData.get("orderInternalNotes"), 1800),
      operationalStatus,
      paymentStatus
    },
    p_order_id: orderId,
    p_order_number: orderNumber,
    p_operation_id: operationId,
    p_payment: {
      provider: cleanString(formData.get("paymentProvider"), 80) || "manual",
      providerReference: cleanNullable(formData.get("paymentReference"), 180)
    },
    p_suppliers: suppliers,
    p_tracking: tracking
  };
}

// A operacao pode identificar o pedido pelo id OU pelo numero. O ledger e por
// id, entao quando so o numero veio o id precisa ser buscado.
async function resolveOrderId({ args, orderNumber, supabase }) {
  if (args.p_order_id) {
    return args.p_order_id;
  }

  const { data } = await supabase
    .from("orders")
    .select("id")
    .eq("order_number", orderNumber)
    .maybeSingle();

  return data?.id ?? null;
}

/**
 * Impede que a descrição do evento entregue a origem do produto.
 *
 * Fechar as colunas estruturadas não fecha um "Comprado na Loja Alfa, rastreio
 * SP123456789" digitado à mão — e `supplier_tracking_events.description` é
 * texto livre renderizado para o cliente.
 *
 * Não é barreira contra quem quer vazar de propósito; é contra o caso real, que
 * é colar o código do fornecedor sem pensar.
 */
async function rejectDescriptionLeaks({ args, orderId, supabase }) {
  const descricao = args.p_tracking?.description;

  if (!descricao || !orderId) {
    return;
  }

  const { data: compras } = await supabase
    .from("supplier_purchases")
    .select("tracking_code, source_order_number")
    .eq("order_id", orderId);

  const texto = descricao.toLowerCase();

  for (const compra of compras ?? []) {
    for (const segredo of [compra.tracking_code, compra.source_order_number]) {
      const limpo = cleanString(segredo, 180);

      // Códigos curtos demais dariam falso positivo em qualquer frase.
      if (limpo.length >= 5 && texto.includes(limpo.toLowerCase())) {
        throw new Error(
          "A descricao do rastreio aparece para o cliente e nao pode conter o codigo nem o numero do pedido na origem."
        );
      }
    }
  }
}

export async function saveAdminOrderOperation({ args, supabase }) {
  await rejectDescriptionLeaks({ args, orderId: args.p_order_id, supabase });

  const { data, error } = await supabase.rpc("save_admin_order_operation", args);

  if (error) {
    throw new Error(error.message);
  }

  if (!data?.orderNumber) {
    throw new Error("O banco nao retornou o pedido atualizado.");
  }

  // O ledger e DERIVADO das fontes, entao vive fora da transacao de proposito:
  // recomputar e sempre possivel depois, e travar a operacao do admin por causa
  // de um numero recalculavel seria pior do que recomputar na proxima gravacao.
  const orderId = await resolveOrderId({ args, orderNumber: data.orderNumber, supabase });

  try {
    await recomputeLedger({ orderId, supabase });
  } catch (error) {
    logServerEvent("error", "ledger_reconciliacao_pos_operacao_falhou", {
      motivo: error?.message,
      orderId: args.p_order_id
    });
  }

  // Avisa o cliente quando TODAS as lojas do pedido ja foram compradas. Sai
  // calada na maioria dos saves — a funcao decide sozinha, e a reserva no banco
  // garante um e-mail no maximo.
  //
  // Tambem fora da transacao, e pela mesma razao do ledger: falha de e-mail nao
  // pode desfazer o registro de uma compra que o operador acabou de fazer.
  try {
    await notifyCustomerOfConfirmedPurchase({ orderId, supabase });
  } catch (error) {
    logServerEvent("error", "confirmacao_cliente_pos_operacao_falhou", {
      motivo: error?.message,
      orderId
    });
  }

  return {
    orderNumber: data.orderNumber,
    // Plural: um pedido tem uma compra POR LOJA, e o save toca todas.
    supplierPurchaseIds: data.supplierPurchaseIds ?? []
  };
}
