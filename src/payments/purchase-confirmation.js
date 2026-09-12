import { logServerEvent } from "../lib/logger.js";

// Enquanto a compra na origem está em algum destes, o pedido do cliente NÃO
// está garantido: ninguém comprou ainda, alguém está conferindo, ou deu
// problema. Avisar aqui seria prometer o que a loja ainda não tem.
const AINDA_NAO_GARANTIDO = new Set(["nao_comprado", "validando_origem", "problema"]);

// Status para onde o pedido vai quando todas as lojas confirmaram. Já existe na
// linha do tempo e já é um passo visível para o cliente.
const STATUS_COMPRADO = "compra_interna_realizada";

async function carregarEnvio() {
  const { sendPurchaseConfirmedEmail } = await import("./purchase-confirmation-email.js");

  return sendPurchaseConfirmedEmail;
}

/**
 * Avisa o cliente de que o pedido dele foi comprado na origem.
 *
 * Roda depois de cada save do admin, e sai calada na maioria das vezes. Só
 * dispara quando TODAS as compras do pedido saíram dos estados acima — um
 * pedido dividido entre três lojas com duas compradas ainda não está garantido.
 *
 * O e-mail vai sem nome de loja, sem número do pedido na origem e sem código de
 * rastreio: o cliente não precisa saber de onde veio, e a loja não quer contar.
 */
export async function notifyCustomerOfConfirmedPurchase({ enviarEmail, orderId, supabase }) {
  if (!orderId) {
    return { motivo: "sem_pedido", ok: false };
  }

  const { data: compras, error: erroCompras } = await supabase
    .from("supplier_purchases")
    .select("id, source_status")
    .eq("order_id", orderId);

  if (erroCompras) {
    logServerEvent("error", "confirmacao_cliente_leitura_falhou", {
      motivo: erroCompras.message,
      orderId
    });

    return { motivo: "falha_ao_ler_compras", ok: false };
  }

  // Nenhuma compra registrada: pedido do fluxo de WhatsApp, que não passa por
  // aqui. Não é erro.
  if (!compras?.length) {
    return { motivo: "sem_compras", ok: true };
  }

  const pendentes = compras.filter((compra) => AINDA_NAO_GARANTIDO.has(compra.source_status));

  if (pendentes.length) {
    return {
      motivo: "compras_pendentes",
      ok: true,
      pendentes: pendentes.length,
      total: compras.length
    };
  }

  // A RESERVA. Marcar antes de enviar, e só seguir se ESTE save foi quem
  // marcou, é o que torna o e-mail no máximo um: dois saves simultâneos
  // disputam esta linha, e só um a leva. Marcar depois do envio deixaria a
  // janela entre enviar e gravar aberta para o segundo mandar de novo.
  const { data: reservado, error: erroReserva } = await supabase
    .from("orders")
    .update({ purchase_confirmation_notified_at: new Date().toISOString() })
    .eq("id", orderId)
    .is("purchase_confirmation_notified_at", null)
    .select("id, order_number, customer_name, customer_email, customer_snapshot")
    .maybeSingle();

  if (erroReserva) {
    logServerEvent("error", "confirmacao_cliente_reserva_falhou", {
      motivo: erroReserva.message,
      orderId
    });

    return { motivo: "falha_na_reserva", ok: false };
  }

  // Zero linhas afetadas: outro save já avisou. Nada a fazer.
  if (!reservado) {
    return { motivo: "ja_avisado", ok: true };
  }

  // O envio entra por parâmetro, com o módulo real como padrão. O módulo de
  // e-mail carrega `server-only`, que impede qualquer teste de chegar até aqui
  // — e a decisão de QUANDO avisar, com a reserva que garante um e-mail só, é
  // justamente a parte que precisa ser exercitada de verdade.
  const enviar = enviarEmail ?? (await carregarEnvio());
  const enviado = await enviar({ order: reservado });

  if (!enviado.enviado && enviado.motivo === "falha-no-envio") {
    // Devolve a reserva para o próximo save tentar de novo. Sem isto, uma falha
    // momentânea do provedor de e-mail deixaria o cliente sem aviso para
    // sempre, e nada apontaria o erro.
    await supabase
      .from("orders")
      .update({ purchase_confirmation_notified_at: null })
      .eq("id", orderId);

    return { motivo: "falha_no_envio", ok: false };
  }

  // Só avança o status DEPOIS do aviso: o cliente vendo "em separação" antes de
  // receber o e-mail é confuso, e a ordem inversa deixaria o status mentindo se
  // o envio falhasse.
  await supabase
    .from("orders")
    .update({ operational_status: STATUS_COMPRADO })
    .eq("id", orderId)
    .in("operational_status", ["compra_interna_pendente", "origem_interna_em_validacao"]);

  await supabase.from("audit_logs").insert({
    action: "cliente_avisado_compra_confirmada",
    metadata: {
      emailEnviado: enviado.enviado,
      lojas: compras.length,
      motivo: enviado.motivo ?? null
    },
    order_id: orderId
  });

  logServerEvent("info", "confirmacao_cliente_enviada", {
    emailEnviado: enviado.enviado,
    lojas: compras.length,
    orderId,
    orderNumber: reservado.order_number
  });

  return { emailEnviado: enviado.enviado, lojas: compras.length, motivo: "avisado", ok: true };
}
