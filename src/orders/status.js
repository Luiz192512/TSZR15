export const paymentStatuses = [
  { id: "aguardando_pagamento", label: "Aguardando pagamento" },
  { id: "pagamento_confirmado", label: "Pagamento confirmado" },
  { id: "cancelado", label: "Cancelado" },
  { id: "reembolsado", label: "Reembolsado" }
];

export const operationalStatuses = [
  { id: "orcamento_iniciado", label: "Orcamento iniciado" },
  { id: "enviado_whatsapp_business", label: "Enviado ao WhatsApp" },
  { id: "aguardando_atendimento", label: "Aguardando atendimento" },
  { id: "dados_incompletos", label: "Dados incompletos" },
  { id: "aguardando_pagamento", label: "Aguardando pagamento" },
  { id: "pagamento_confirmado", label: "Pagamento confirmado" },
  { id: "origem_interna_em_validacao", label: "Origem em validacao" },
  { id: "compra_interna_pendente", label: "Compra interna pendente" },
  { id: "compra_interna_realizada", label: "Compra interna realizada" },
  { id: "aguardando_postagem_envio", label: "Aguardando postagem" },
  { id: "rastreio_recebido", label: "Rastreio recebido" },
  { id: "em_transito", label: "Em transito" },
  { id: "saiu_para_entrega", label: "Saiu para entrega" },
  { id: "entregue", label: "Entregue" },
  { id: "problema_origem_interna", label: "Problema na origem" },
  { id: "problema_envio", label: "Problema no envio" },
  { id: "cancelado", label: "Cancelado" },
  { id: "reembolsado", label: "Reembolsado" }
];

export const supplierChannels = [
  { id: "", label: "Nao definido" },
  { id: "shopee", label: "Shopee" },
  { id: "aliexpress", label: "AliExpress" },
  { id: "fornecedor_homologado", label: "Fornecedor homologado" },
  { id: "outro", label: "Outro" }
];

export const supplierSourceStatuses = [
  { id: "nao_comprado", label: "Nao comprado" },
  { id: "validando_origem", label: "Validando origem" },
  { id: "comprado", label: "Comprado" },
  { id: "postado", label: "Postado" },
  { id: "em_transito", label: "Em transito" },
  { id: "entregue", label: "Entregue" },
  { id: "problema", label: "Problema" },
  { id: "cancelado", label: "Cancelado" }
];

export const internalOrderStatuses = [
  { id: "pendente", label: "Pendente" },
  { id: "confirmado", label: "Confirmado" },
  { id: "recusado", label: "Recusado" }
];

export const internalOrderDecisionStatuses = internalOrderStatuses.filter(
  (status) => status.id !== "pendente"
);

export const internalOrderPendingAfterMs = 24 * 60 * 60 * 1000;

export const customerTrackingSteps = [
  { id: "enviado_whatsapp_business", label: "Pedido recebido" },
  { id: "aguardando_atendimento", label: "Em atendimento" },
  { id: "aguardando_pagamento", label: "Pagamento em confirmacao" },
  { id: "pagamento_confirmado", label: "Pagamento confirmado" },
  { id: "origem_interna_em_validacao", label: "Preparando envio" },
  { id: "compra_interna_realizada", label: "Pedido em separacao" },
  { id: "rastreio_recebido", label: "Rastreio recebido" },
  { id: "em_transito", label: "Em transporte" },
  { id: "saiu_para_entrega", label: "Saiu para entrega" },
  { id: "entregue", label: "Entregue" }
];

export function getStatusLabel(status, statuses = operationalStatuses) {
  return statuses.find((item) => item.id === status)?.label ?? formatStatusLabel(status);
}

export function formatStatusLabel(status) {
  return String(status ?? "")
    .split("_")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function isKnownStatus(status, statuses) {
  return statuses.some((item) => item.id === status);
}

export function getEffectiveInternalOrderStatus(order, now = new Date()) {
  const storedStatus = String(order?.internal_order_status ?? "").trim();

  if (storedStatus) {
    return storedStatus;
  }

  const createdAt = new Date(order?.created_at ?? "");

  if (Number.isNaN(createdAt.getTime())) {
    return "";
  }

  return now.getTime() - createdAt.getTime() >= internalOrderPendingAfterMs
    ? "pendente"
    : "";
}
