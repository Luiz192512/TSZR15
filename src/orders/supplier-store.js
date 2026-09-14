// Chave que identifica uma loja de fornecedor.
//
// Ela decide duas coisas que nao podem discordar: como os itens de um pedido
// sao AGRUPADOS numa compra por loja, e qual a chave de IDEMPOTENCIA dessa
// compra. Se a normalizacao do banco e a daqui divergirem, um webhook reenviado
// cria uma segunda compra para a mesma loja — e o operador compra duas vezes.
//
// Por isso existe uma copia em SQL (`public.build_supplier_store_key`, em
// 20260903180000_catalog_supplier_sources.sql) e um teste que roda as duas com
// a mesma lista de entradas e compara o resultado.

// Sem `String.prototype.normalize("NFD")` de proposito: o SQL usa `translate`
// com uma tabela fixa, e as duas precisam produzir exatamente o mesmo texto.
// Uma tabela literal dos dois lados e o que torna a comparacao verificavel.
const ACENTOS = "áàâãäéèêëíìîïóòôõöúùûüçñ";
const SEM_ACENTO = "aaaaaeeeeiiiiooooouuuucn";

const CANAL_PADRAO = "outro";

// Grupo dos itens cujo produto nao tem origem cadastrada. E um grupo DE VERDADE,
// nao um descarte: o item precisa aparecer em alguma compra, senao some do
// pedido em silencio e ninguem compra.
export const LOJA_SEM_ORIGEM = "sem_loja";

function removerAcentos(texto) {
  let resultado = "";

  for (const caractere of texto) {
    const indice = ACENTOS.indexOf(caractere);

    resultado += indice === -1 ? caractere : SEM_ACENTO[indice];
  }

  return resultado;
}

/**
 * Monta a chave da loja a partir do canal e do nome digitado pelo operador.
 *
 * Devolve `null` quando nao ha nome de loja — o chamador decide se isso vira
 * `LOJA_SEM_ORIGEM` (no agrupamento) ou se a linha fica fora do indice unico
 * parcial (nas compras antigas, que nao tem loja registrada).
 */
export function normalizeStoreKey(internalChannel, storeName) {
  const apelido = removerAcentos(
    String(storeName ?? "")
      .trim()
      .toLowerCase()
  )
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  // Apelido vazio devolve null, e nao "canal:". Um nome so de pontuacao ("---")
  // produziria uma chave sem parte identificadora, e DUAS lojas assim
  // colidiriam na mesma compra. Sem nome utilizavel, nao ha loja.
  if (!apelido) {
    return null;
  }

  const canal = String(internalChannel ?? "")
    .trim()
    .toLowerCase();

  return `${canal || CANAL_PADRAO}:${apelido}`;
}
