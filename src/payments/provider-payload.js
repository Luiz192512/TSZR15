// Dados que o provedor usa para DECIDIR se aprova a cobranca.
//
// O Mercado Pago pontua a "qualidade da integracao" e usa esses campos na
// analise antifraude: quanto mais ele sabe sobre quem esta comprando e o que
// esta sendo comprado, menos ele precisa recusar por precaucao. A loja mandava
// so o e-mail no cartao e no Pix — o minimo que a API aceita, e o pior caso
// para a taxa de aprovacao.
//
// TUDO aqui sai do PEDIDO no banco. Nada vem do corpo da requisicao: a pagina
// de pagamento e aberta so com o id do pedido, entao aceitar identidade do
// cliente permitiria a qualquer um associar a cobranca de um pedido alheio aos
// proprios dados.

const MAX_DESCRITOR = 22;

function limpar(valor, maximo = 256) {
  return String(valor ?? "")
    .trim()
    .slice(0, maximo);
}

function apenasDigitos(valor) {
  return String(valor ?? "").replace(/\D/g, "");
}

/**
 * Separa "Luiz Gustavo Fortes" em nome e sobrenome.
 *
 * O provedor quer os dois campos. Nome de uma palavra so vai inteiro no
 * primeiro, e o sobrenome fica vazio — melhor do que repetir o mesmo valor nos
 * dois, que e o tipo de dado sujo que a analise antifraude penaliza.
 */
export function splitCustomerName(nomeCompleto) {
  const partes = limpar(nomeCompleto, 160).split(/\s+/).filter(Boolean);

  if (!partes.length) {
    return { firstName: "", lastName: "" };
  }

  return {
    firstName: partes[0],
    lastName: partes.slice(1).join(" ")
  };
}

/**
 * Telefone no formato que o provedor espera: DDD separado do numero.
 *
 * Devolve `undefined` quando nao da para separar — mandar um telefone partido
 * errado e pior do que nao mandar.
 */
export function buildPayerPhone(order) {
  const digitos = apenasDigitos(
    order?.customer_phone || order?.customer_whatsapp || order?.customer_snapshot?.phone
  );

  // Tira o 55 do pais quando ele veio junto (o WhatsApp e gravado assim).
  const nacional = digitos.length > 11 && digitos.startsWith("55") ? digitos.slice(2) : digitos;

  if (nacional.length < 10 || nacional.length > 11) {
    return undefined;
  }

  return {
    area_code: nacional.slice(0, 2),
    number: nacional.slice(2)
  };
}

/**
 * Documento do cliente, quando o pedido tem.
 *
 * Boleto EXIGE, e por isso o formulario dele pede. Cartao e Pix nao exigem, mas
 * o provedor usa na analise: pagador identificado tem aprovacao mais alta.
 */
export function buildPayerIdentification(order) {
  const numero = apenasDigitos(order?.customer_tax_id || order?.customer_snapshot?.taxId);

  if (numero.length !== 11 && numero.length !== 14) {
    return undefined;
  }

  return { number: numero, type: numero.length === 11 ? "CPF" : "CNPJ" };
}

/**
 * Pagador completo, montado a partir do pedido.
 *
 * `address` vem de `resolvePayerAddress(order)`, que consulta o ViaCEP no
 * servidor — ela ja existia para o boleto e agora vale para as tres cobrancas.
 */
export function buildPayerFromOrder(order, address) {
  const { firstName, lastName } = splitCustomerName(order?.customer_name);

  return {
    address: address ?? undefined,
    email: limpar(order?.customer_email, 254),
    first_name: firstName || undefined,
    identification: buildPayerIdentification(order),
    last_name: lastName || undefined,
    phone: buildPayerPhone(order)
  };
}

/**
 * Endereco de entrega no formato do provedor.
 *
 * Parte do MESMO objeto do pagador — no dropshipping cobranca e entrega vao
 * para o mesmo lugar, e inventar uma diferenca aqui so criaria dado divergente
 * para a analise comparar.
 *
 * ATENCAO ao nome dos campos: os dois blocos usam nomes DIFERENTES para a mesma
 * coisa. `payer.address` quer `city` e `federal_unit`;
 * `additional_info.shipments.receiver_address` quer `city_name` e `state_name`.
 * Uma chamada real ao provedor recusou a cobranca inteira com
 * "The name of the following parameters is wrong: [payer.address.city_name]" —
 * mandar o nome errado nao degrada a pontuacao, derruba o pagamento.
 */
function buildReceiverAddress(address) {
  if (!address) {
    return undefined;
  }

  return {
    city_name: address.city || address.city_name || undefined,
    state_name: address.federal_unit || address.state_name || undefined,
    street_name: address.street_name || undefined,
    street_number: address.street_number ? String(address.street_number) : undefined,
    zip_code: address.zip_code || undefined
  };
}

/**
 * `additional_info`: o bloco que mais pesa na analise do provedor.
 *
 * Item com titulo, categoria e preco unitario permite ao antifraude comparar o
 * que esta sendo comprado com o perfil de compra do cartao. Sem isso ele decide
 * no escuro, e decidir no escuro significa recusar mais.
 */
export function buildAdditionalInfo({ address, items, order }) {
  const { firstName, lastName } = splitCustomerName(order?.customer_name);
  const receiver = buildReceiverAddress(address);

  const itens = (items ?? [])
    .filter((item) => Number(item?.quantity) > 0)
    .map((item) => {
      const variacao = [item.variation, item.size]
        .map((parte) => limpar(parte, 60))
        .filter(Boolean);

      return {
        category_id: limpar(item.storefront_category_ids?.[0], 60) || "others",
        // O provedor trabalha em unidades da moeda; a loja, em centavos.
        description: variacao.length ? variacao.join(" — ") : undefined,
        id: limpar(item.product_slug || item.product_id, 60),
        quantity: Number(item.quantity),
        title: limpar(item.product_name, 256),
        unit_price: Number((Number(item.unit_price_cents ?? 0) / 100).toFixed(2))
      };
    });

  const info = {
    payer: {
      first_name: firstName || undefined,
      last_name: lastName || undefined,
      phone: buildPayerPhone(order)
    }
  };

  if (itens.length) {
    info.items = itens;
  }

  if (receiver) {
    info.shipments = { receiver_address: receiver };
  }

  return info;
}

/**
 * O que aparece na fatura do cartao.
 *
 * Sem ele, a cobranca sai com um nome que o cliente nao reconhece — e "nao
 * reconheco essa compra" e o caminho mais curto para uma contestacao, que
 * custa mais caro que o pedido.
 *
 * O provedor corta em 22 caracteres e recusa acento e simbolo.
 */
export function buildStatementDescriptor(storeName) {
  const limpo = String(storeName ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^A-Za-z0-9 ]+/g, "")
    .trim()
    .slice(0, MAX_DESCRITOR)
    .trim();

  return limpo || undefined;
}
