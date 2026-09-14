import { logServerEvent } from "../lib/logger.js";
import { operationalStatuses } from "../orders/status.js";
import { LOJA_SEM_ORIGEM } from "../orders/supplier-store.js";

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

// Exportada porque a MESMA lista existe dentro de `prepare_supplier_purchases`,
// no banco, e as duas precisam concordar. A guarda de avanço-só mora no SQL
// agora (é lá que a transação acontece), mas se a linha do tempo ganhar um
// status novo aqui e não lá, um pedido em estado novo seria puxado de volta
// para "compra pendente" — ou deixado parado. Um teste compara as duas listas.
export const STATUS_ANTES_DA_COMPRA = LINHA_DO_TEMPO.slice(
  0,
  LINHA_DO_TEMPO.indexOf(STATUS_COMPRA_PENDENTE)
);

/**
 * Prefixo da automação, um por pedido.
 *
 * A chave final tem a LOJA no fim, porque um pedido pode virar várias compras —
 * uma por fornecedor. `buildAutomationKey` monta a chave completa, e a mesma
 * concatenação acontece dentro de `prepare_supplier_purchases`. As duas
 * precisam concordar: se discordarem, o webhook reenviado cria uma segunda
 * compra da mesma loja e o operador compra duas vezes.
 */
export function buildAutomationPrefix(orderId) {
  return `pedido:${orderId}`;
}

/**
 * Chave de idempotência de UMA compra: pedido mais loja.
 *
 * Webhook reenviado, evento fora de ordem e duas requisições simultâneas
 * produzem a MESMA chave para a mesma loja, e a UNIQUE parcial em
 * `supplier_purchases.automation_key` recusa a segunda inserção.
 *
 * Item cujo produto não tem origem cadastrada cai em `LOJA_SEM_ORIGEM`, que é um
 * grupo de verdade: sem ele o item sumiria do agrupamento e ninguém compraria,
 * com o pedido já pago.
 */
export function buildAutomationKey(orderId, storeKey = LOJA_SEM_ORIGEM) {
  return `${buildAutomationPrefix(orderId)}:loja:${storeKey || LOJA_SEM_ORIGEM}`;
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
  const automationPrefix = buildAutomationPrefix(orderId);

  // Uma chamada, uma transação. Antes eram quatro escritas separadas pelo
  // PostgREST — criar a compra, mover o status, gravar rastreio e auditoria —
  // e uma falha no meio deixava pedido pago com status de "compra pendente" e
  // nenhuma compra registrada. Com N lojas por pedido o risco só cresceria.
  const { data: resultado, error } = await supabase.rpc("prepare_supplier_purchases", {
    p_automation_prefix: automationPrefix,
    p_order_id: orderId
  });

  if (error) {
    // Pedido que sumiu aqui significa dinheiro recebido sem nada preparado
    // para entregar — é a falha que mais precisa aparecer no log.
    const sumiu = /Pedido nao encontrado/i.test(error.message ?? "");

    logServerEvent(
      "error",
      sumiu ? "automacao_fornecedor_pedido_nao_encontrado" : "automacao_fornecedor_falhou",
      { motivo: error.message, orderId, paymentId }
    );

    return { motivo: sumiu ? "pedido_nao_encontrado" : "falha_ao_criar_compra", ok: false };
  }

  // O pagamento ainda não está confirmado no pedido: cartão só autorizado ou
  // boleto em aberto. Preparar a compra aqui seria trabalho em cima de dinheiro
  // que a loja não tem.
  if (resultado?.motivo === "pagamento_nao_confirmado") {
    logServerEvent("warn", "automacao_fornecedor_pagamento_nao_confirmado", {
      orderId,
      paymentStatus: resultado.paymentStatus
    });

    return { motivo: "pagamento_nao_confirmado", ok: false };
  }

  // Webhook reenviado. Não é erro, e nada deve ser refeito — nem o e-mail ao
  // operador, que é disparado só quando `motivo === "criada"`.
  if (!resultado?.aplicado) {
    logServerEvent("info", "automacao_fornecedor_ja_executada", { orderId });

    return { compras: resultado?.compras ?? [], motivo: "ja_executada", ok: true };
  }

  const { data: order } = await supabase
    .from("orders")
    .select("id, order_number, customer_name, total_cents")
    .eq("id", orderId)
    .maybeSingle();

  logServerEvent("info", "automacao_fornecedor_executada", {
    lojas: resultado.criadas,
    orderId,
    orderNumber: resultado.orderNumber
  });

  return {
    compras: resultado.compras ?? [],
    lojas: resultado.criadas,
    motivo: "criada",
    ok: true,
    order
  };
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
  // Filtra por PEDIDO, não por chave de automação: um pedido agora tem uma
  // compra por loja, e a versão anterior usava `.eq("automation_key", …)` com
  // `.maybeSingle()`, que ERRA assim que existem duas linhas. Por pedido também
  // cobre a chave antiga (`pedido:<id>`, sem loja) das compras já criadas.
  const { data: compras } = await supabase
    .from("supplier_purchases")
    .select("id, source_status, created_by, source_store_name")
    .eq("order_id", orderId)
    .eq("created_by", "automacao");

  if (!compras?.length) {
    return { motivo: "nada_a_desfazer", ok: true };
  }

  // Intocada = a automação criou e o operador não comprou nada ainda. Compra
  // que ele já executou tem dinheiro envolvido: apagar destruiria o registro de
  // um gasto real, então ela fica e é marcada como problema.
  const intocadas = compras.filter((compra) => compra.source_status === "nao_comprado");
  const iniciadas = compras.filter((compra) => compra.source_status !== "nao_comprado");

  if (intocadas.length) {
    await supabase
      .from("supplier_purchases")
      .delete()
      .in(
        "id",
        intocadas.map((compra) => compra.id)
      );
  }

  for (const compra of iniciadas) {
    await supabase
      .from("supplier_purchases")
      .update({
        internal_notes: `Pagamento revertido (${motivo}). Compra já iniciada${
          compra.source_store_name ? ` em ${compra.source_store_name}` : ""
        } — conferir estorno com o fornecedor.`,
        source_status: "problema"
      })
      .eq("id", compra.id);
  }

  // UM evento por pedido, mesmo com várias lojas: o cliente lê esta tabela, e
  // três eventos iguais denunciariam que o pedido dele foi partido em três
  // compras em fornecedores diferentes.
  await supabase.from("supplier_tracking_events").insert({
    description: `Pagamento revertido (${motivo}).`,
    event_status: "cancelado",
    order_id: orderId,
    supplier_purchase_id: null
  });

  await supabase.from("audit_logs").insert({
    action: "automacao_compra_interna_desfeita",
    metadata: {
      comprasIniciadas: iniciadas.length,
      comprasRemovidas: intocadas.length,
      motivo
    },
    order_id: orderId
  });

  logServerEvent("info", "automacao_fornecedor_desfeita", {
    comprasIniciadas: iniciadas.length,
    comprasRemovidas: intocadas.length,
    motivo,
    orderId
  });

  return {
    comprasIniciadas: iniciadas.length,
    comprasRemovidas: intocadas.length,
    motivo: iniciadas.length ? "marcada_como_problema" : "removida",
    ok: true
  };
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
