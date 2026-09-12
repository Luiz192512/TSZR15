import { logServerEvent } from "../lib/logger.js";
import { operationalStatuses } from "../orders/status.js";

const UNIQUE_VIOLATION = "23505";

// Status operacional em que o pedido entra quando o pagamento é confirmado: a
// automação PREPARA a compra e avisa o humano. Ela nunca compra no fornecedor.
const STATUS_COMPRA_PENDENTE = "compra_interna_pendente";

// De onde o pedido PODE avançar para "compra interna pendente": tudo o que vem
// antes dela na linha do tempo, derivado da própria lista para que um status
// novo não fique de fora em silêncio.
//
// A lista é o que ela é porque um pedido pago pelo site nasce em
// `enviado_whatsapp_business` e nunca passa por `pagamento_confirmado` no campo
// operacional — exigir exatamente esse valor fazia a automação criar a compra e
// deixar o status parado, como uma cobrança real de cartão mostrou.
//
// O que vem DEPOIS (compra realizada, postagem, rastreio) e os estados de
// exceção (problema, cancelado, reembolsado) ficam de fora: nesses casos puxar
// o pedido de volta seria pior do que não mexer.
const LINHA_DO_TEMPO = operationalStatuses.map((status) => status.id);
const STATUS_ANTES_DA_COMPRA = LINHA_DO_TEMPO.slice(
  0,
  LINHA_DO_TEMPO.indexOf(STATUS_COMPRA_PENDENTE)
);

/**
 * Chave de idempotência da automação.
 *
 * Derivada só do pedido: o webhook reenviado, o evento fora de ordem e duas
 * requisições simultâneas produzem a MESMA chave, e a UNIQUE parcial em
 * `supplier_purchases.automation_key` recusa a segunda inserção.
 */
export function buildAutomationKey(orderId) {
  return `pedido:${orderId}`;
}

/**
 * Dispara o trabalho interno quando o pagamento é confirmado.
 *
 * O que ela faz: cria a linha de compra no fornecedor, move o status
 * operacional, registra o evento de rastreio e a auditoria, e avisa o operador.
 *
 * O que ela NÃO faz, por decisão do dono da loja: comprar em Shopee,
 * AliExpress ou qualquer fornecedor. Nenhuma automação de navegador, nenhuma
 * API de marketplace. A compra continua sendo um ato humano — isto aqui só
 * elimina a digitação e o esquecimento.
 */
export async function runSupplierAutomation({ orderId, paymentId, supabase }) {
  const automationKey = buildAutomationKey(orderId);

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("id, order_number, operational_status, customer_name, total_cents")
    .eq("id", orderId)
    .maybeSingle();

  if (orderError || !order) {
    // A automacao roda depois da confirmacao do pagamento: pedido que sumiu
    // aqui significa dinheiro recebido sem nada preparado para entregar.
    logServerEvent("error", "automacao_fornecedor_pedido_nao_encontrado", {
      motivo: orderError?.message,
      orderId
    });

    return { motivo: "pedido_nao_encontrado", ok: false };
  }

  const { data: compra, error: compraError } = await supabase
    .from("supplier_purchases")
    .insert({
      automation_key: automationKey,
      created_by: "automacao",
      internal_notes: "Criada automaticamente na confirmação do pagamento.",
      order_id: orderId,
      source_status: "nao_comprado"
    })
    .select("id")
    .maybeSingle();

  // Já existe: o webhook chegou de novo. Não é erro, e nada deve ser refeito.
  if (compraError?.code === UNIQUE_VIOLATION) {
    logServerEvent("info", "automacao_fornecedor_ja_executada", { orderId });

    return { motivo: "ja_executada", ok: true };
  }

  if (compraError) {
    logServerEvent("error", "automacao_fornecedor_falhou", {
      motivo: compraError.message,
      orderId
    });

    return { motivo: "falha_ao_criar_compra", ok: false };
  }

  // O status só AVANÇA. Um pedido que o operador já moveu adiante — ou que
  // entrou em estado de exceção — não volta para "compra pendente". O filtro
  // repetido no `.in()` fecha a corrida entre ler e escrever.
  if (STATUS_ANTES_DA_COMPRA.includes(order.operational_status)) {
    await supabase
      .from("orders")
      .update({ operational_status: STATUS_COMPRA_PENDENTE })
      .eq("id", orderId)
      .in("operational_status", STATUS_ANTES_DA_COMPRA);
  }

  await supabase.from("supplier_tracking_events").insert({
    description: "Pagamento confirmado. Compra no fornecedor pendente.",
    event_status: STATUS_COMPRA_PENDENTE,
    order_id: orderId,
    supplier_purchase_id: compra?.id ?? null
  });

  await supabase.from("audit_logs").insert({
    action: "automacao_compra_interna_criada",
    metadata: {
      automationKey,
      orderNumber: order.order_number,
      origem: "webhook_pagamento",
      paymentId
    },
    order_id: orderId
  });

  logServerEvent("info", "automacao_fornecedor_executada", {
    orderId,
    orderNumber: order.order_number,
    supplierPurchaseId: compra?.id
  });

  return { compraId: compra?.id ?? null, motivo: "criada", ok: true, order };
}

/**
 * Desfaz o que a automação preparou, quando o dinheiro volta.
 *
 * Só remove compra que a AUTOMAÇÃO criou e que o operador ainda não tocou
 * (`source_status = 'nao_comprado'`). Se ele já comprou no fornecedor, apagar a
 * linha destruiria o registro de um gasto real — nesse caso a compra fica, com
 * a auditoria explicando que o pagamento foi revertido.
 */
export async function undoSupplierAutomation({ motivo, orderId, supabase }) {
  const automationKey = buildAutomationKey(orderId);

  const { data: compra } = await supabase
    .from("supplier_purchases")
    .select("id, source_status, created_by")
    .eq("automation_key", automationKey)
    .maybeSingle();

  if (!compra) {
    return { motivo: "nada_a_desfazer", ok: true };
  }

  const intocada = compra.created_by === "automacao" && compra.source_status === "nao_comprado";

  if (intocada) {
    await supabase.from("supplier_purchases").delete().eq("id", compra.id);
  } else {
    // Compra real registrada: o gasto existe e precisa aparecer na conciliação.
    await supabase
      .from("supplier_purchases")
      .update({
        internal_notes: `Pagamento revertido (${motivo}). Compra já iniciada — conferir estorno com o fornecedor.`,
        source_status: "problema"
      })
      .eq("id", compra.id);
  }

  await supabase.from("supplier_tracking_events").insert({
    description: `Pagamento revertido (${motivo}).`,
    event_status: "cancelado",
    order_id: orderId,
    supplier_purchase_id: intocada ? null : compra.id
  });

  await supabase.from("audit_logs").insert({
    action: "automacao_compra_interna_desfeita",
    metadata: { automationKey, compraRemovida: intocada, motivo },
    order_id: orderId
  });

  logServerEvent("info", "automacao_fornecedor_desfeita", {
    compraRemovida: intocada,
    motivo,
    orderId
  });

  return { motivo: intocada ? "removida" : "marcada_como_problema", ok: true };
}

/**
 * Estorna o ledger. O dinheiro voltou, então margem e repasse deixam de valer.
 *
 * `payout_status = 'estornado'` vale inclusive quando o repasse já tinha sido
 * marcado como executado: nesse caso o valor precisa ser devolvido, e esconder
 * isso do painel seria pior do que mostrar a inconsistência.
 */
export async function reverseLedger({ motivo, orderId, refundedCents, supabase }) {
  const { data: ledger } = await supabase
    .from("order_ledger")
    .select("id, payout_status")
    .eq("order_id", orderId)
    .maybeSingle();

  if (!ledger) {
    return { motivo: "sem_ledger", ok: true };
  }

  await supabase
    .from("order_ledger")
    .update({
      notes: `Pagamento revertido (${motivo}).${
        ledger.payout_status === "repassado"
          ? " ATENCAO: repasse ja executado, exige devolucao."
          : ""
      }`,
      payout_status: "estornado",
      reconciled_margin_cents: 0,
      refunded_amount_cents: refundedCents ?? 0
    })
    .eq("id", ledger.id);

  return {
    motivo: "estornado",
    ok: true,
    repasseJaExecutado: ledger.payout_status === "repassado"
  };
}
