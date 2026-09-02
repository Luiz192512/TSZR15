import { logServerEvent } from "../lib/logger.js";

const VIACEP_URL = "https://viacep.com.br/ws";

/**
 * Numero da casa dentro da linha de endereco livre do checkout.
 *
 * O checkout guarda o endereco como UMA linha de texto, e o emissor do boleto
 * quer os campos separados. "S/N" e a saida quando nao ha numero — recusar a
 * cobranca por causa disso seria pior do que mandar o que o proprio cliente
 * escreveu.
 */
export function extractStreetNumber(line) {
  const match = String(line ?? "").match(/(?:^|[,\s])n?[º°.]?\s*(\d{1,6})(?=\D|$)/i);

  return match?.[1] ?? "S/N";
}

export function extractStreetName(line) {
  const primeiraParte = String(line ?? "")
    .split(",")[0]
    .trim();

  return primeiraParte || "Endereco nao informado";
}

async function fetchViaCep(cep) {
  try {
    const response = await fetch(`${VIACEP_URL}/${cep}/json/`, {
      headers: { accept: "application/json" }
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();

    return data?.erro ? null : data;
  } catch {
    return null;
  }
}

/**
 * Endereco do pagador para o boleto, montado a partir do PEDIDO.
 *
 * Vem do servidor, nunca do corpo da requisicao nem da tela: a pagina de
 * pagamento e aberta so com o id do pedido, e mostrar ali o endereco do cliente
 * entregaria o dado a quem tivesse o link. Perguntar de novo o que ele ja
 * digitou no checkout tambem nao — o pedido ja sabe.
 *
 * O emissor recusa boleto sem endereco (`rejected_insufficient_data`, visto
 * numa cobranca real de sandbox). Bairro, cidade e UF saem do CEP pelo ViaCEP;
 * rua e numero saem da linha que o cliente escreveu.
 */
export async function resolvePayerAddress(order) {
  const snapshot = order?.address_snapshot ?? {};
  const cep = String(snapshot.cep ?? "").replace(/\D/g, "");

  if (cep.length !== 8) {
    return null;
  }

  const viaCep = await fetchViaCep(cep);

  if (!viaCep) {
    logServerEvent("warn", "boleto_endereco_cep_nao_resolvido", { orderId: order?.id });

    return null;
  }

  return {
    city: viaCep.localidade || "",
    federal_unit: viaCep.uf || "",
    neighborhood: viaCep.bairro || "",
    street_name: viaCep.logradouro || extractStreetName(snapshot.line),
    street_number: extractStreetNumber(snapshot.line),
    zip_code: cep
  };
}
