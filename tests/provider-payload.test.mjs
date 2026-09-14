import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildAdditionalInfo,
  buildPayerFromOrder,
  buildPayerIdentification,
  buildPayerPhone,
  buildStatementDescriptor,
  splitCustomerName
} from "../src/payments/provider-payload.js";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

function semComentarios(codigo) {
  return codigo.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/[^\n]*$/gm, "");
}

const PEDIDO = {
  customer_email: "cliente@example.com",
  customer_name: "Luiz Gustavo Fortes",
  customer_phone: "(44) 99999-7410",
  customer_tax_id: "123.456.789-09"
};

const ENDERECO = {
  city_name: "Maringa",
  federal_unit: "PR",
  street_name: "Avenida Brasil",
  street_number: "1200",
  zip_code: "87013000"
};

// ---------------------------------------------------------------------------
// Nome
// ---------------------------------------------------------------------------

test("separa nome e sobrenome", () => {
  assert.deepEqual(splitCustomerName("Luiz Gustavo Fortes"), {
    firstName: "Luiz",
    lastName: "Gustavo Fortes"
  });
});

// Repetir o mesmo valor nos dois campos e o tipo de dado sujo que a analise
// antifraude penaliza — pior do que deixar o sobrenome vazio.
test("nome de uma palavra nao repete no sobrenome", () => {
  assert.deepEqual(splitCustomerName("Madonna"), { firstName: "Madonna", lastName: "" });
  assert.deepEqual(splitCustomerName("   "), { firstName: "", lastName: "" });
  assert.deepEqual(splitCustomerName(null), { firstName: "", lastName: "" });
});

// ---------------------------------------------------------------------------
// Telefone
// ---------------------------------------------------------------------------

test("separa DDD do numero", () => {
  assert.deepEqual(buildPayerPhone({ customer_phone: "(44) 99999-7410" }), {
    area_code: "44",
    number: "999997410"
  });
});

// O WhatsApp e gravado com o codigo do pais. Mandar "55" como DDD seria um
// telefone partido errado, e o provedor usa esse campo na analise.
test("tira o codigo do pais do numero de WhatsApp", () => {
  assert.deepEqual(buildPayerPhone({ customer_whatsapp: "5544999997410" }), {
    area_code: "44",
    number: "999997410"
  });
});

test("telefone que nao da para separar fica de fora", () => {
  for (const invalido of ["", "123", "99999", null, "abc"]) {
    assert.equal(
      buildPayerPhone({ customer_phone: invalido }),
      undefined,
      `${invalido} nao deveria virar telefone`
    );
  }
});

// ---------------------------------------------------------------------------
// Documento
// ---------------------------------------------------------------------------

test("reconhece CPF e CNPJ pelo tamanho", () => {
  assert.deepEqual(buildPayerIdentification({ customer_tax_id: "123.456.789-09" }), {
    number: "12345678909",
    type: "CPF"
  });
  assert.deepEqual(buildPayerIdentification({ customer_tax_id: "12.345.678/0001-95" }), {
    number: "12345678000195",
    type: "CNPJ"
  });
});

test("documento incompleto fica de fora", () => {
  assert.equal(buildPayerIdentification({ customer_tax_id: "123456" }), undefined);
  assert.equal(buildPayerIdentification({}), undefined);
});

// ---------------------------------------------------------------------------
// Pagador
// ---------------------------------------------------------------------------

test("o pagador sai completo quando o pedido tem os dados", () => {
  const payer = buildPayerFromOrder(PEDIDO, ENDERECO);

  assert.equal(payer.email, "cliente@example.com");
  assert.equal(payer.first_name, "Luiz");
  assert.equal(payer.last_name, "Gustavo Fortes");
  assert.deepEqual(payer.identification, { number: "12345678909", type: "CPF" });
  assert.deepEqual(payer.phone, { area_code: "44", number: "999997410" });
  assert.equal(payer.address, ENDERECO);
});

// Pedido antigo pode nao ter telefone nem documento. A cobranca precisa sair
// mesmo assim — com aprovacao mais baixa, mas sair.
test("pedido incompleto ainda gera pagador valido", () => {
  const payer = buildPayerFromOrder({ customer_email: "a@b.com" }, null);

  assert.equal(payer.email, "a@b.com");
  assert.equal(payer.identification, undefined);
  assert.equal(payer.phone, undefined);
  assert.equal(payer.address, undefined);
});

// ---------------------------------------------------------------------------
// additional_info
// ---------------------------------------------------------------------------

test("os itens viram a lista que o provedor entende", () => {
  const info = buildAdditionalInfo({
    address: ENDERECO,
    items: [
      {
        product_name: "Bolha esportiva",
        product_slug: "bolha-esportiva",
        quantity: 2,
        size: "M",
        storefront_category_ids: ["carenagem"],
        unit_price_cents: 12900,
        variation: "Preto"
      }
    ],
    order: PEDIDO
  });

  assert.equal(info.items.length, 1);
  assert.deepEqual(info.items[0], {
    category_id: "carenagem",
    description: "Preto — M",
    id: "bolha-esportiva",
    quantity: 2,
    title: "Bolha esportiva",
    // Centavos viram unidades da moeda: o provedor recusaria 12900 como preco.
    unit_price: 129
  });

  assert.deepEqual(info.shipments.receiver_address.zip_code, "87013000");
  assert.equal(info.payer.first_name, "Luiz");
});

test("item sem quantidade nao entra", () => {
  const info = buildAdditionalInfo({
    items: [{ product_name: "x", quantity: 0, unit_price_cents: 100 }],
    order: PEDIDO
  });

  assert.equal(info.items, undefined);
});

test("sem endereco o bloco de entrega nao e inventado", () => {
  const info = buildAdditionalInfo({ address: null, items: [], order: PEDIDO });

  assert.equal(info.shipments, undefined);
});

// ---------------------------------------------------------------------------
// Descritor da fatura
// ---------------------------------------------------------------------------

test("o descritor cabe na fatura e nao leva acento", () => {
  assert.equal(buildStatementDescriptor("TSZR15 Acessórios"), "TSZR15 Acessorios");
  assert.equal(buildStatementDescriptor("Loja & Cia!"), "Loja  Cia");
  assert.equal(buildStatementDescriptor(null), undefined);
  assert.equal(buildStatementDescriptor("!!!"), undefined);

  const longo = buildStatementDescriptor("Uma loja com um nome muito muito longo demais");
  assert.ok(longo.length <= 22, `descritor com ${longo.length} caracteres`);
});

// ---------------------------------------------------------------------------
// De onde os dados vem
// ---------------------------------------------------------------------------

// A pagina de pagamento abre so com o id do pedido. Aceitar identidade do corpo
// da requisicao deixaria qualquer um associar a cobranca de um pedido alheio aos
// proprios dados — e o pagador e o que o antifraude analisa.
test("as tres rotas montam o pagador a partir do PEDIDO", async () => {
  for (const metodo of ["pix", "cartao"]) {
    const rota = semComentarios(await source(`app/api/pagamento/${metodo}/route.js`));

    assert.match(rota, /buildPayerFromOrder\(order, address\)/, `${metodo} deveria usar o pedido`);
    assert.match(rota, /buildAdditionalInfo\(\{ address, items, order \}\)/);
  }

  // O boleto ja fazia isso; o teste guarda para nao regredir.
  const boleto = semComentarios(await source("app/api/pagamento/boleto/route.js"));

  assert.match(boleto, /resolvePayerAddress\(order\)/);
  assert.match(boleto, /buildAdditionalInfo\(\{ address, items, order \}\)/);
});

// `deviceId` e a UNICA coisa do corpo que entra no payload do provedor — e ela
// descreve o AMBIENTE, nao a identidade. Forjar so prejudicaria quem forjasse.
test("o cartao aceita do corpo apenas o identificador do dispositivo", async () => {
  const rota = semComentarios(await source("app/api/pagamento/cartao/route.js"));
  const inicio = rota.indexOf("createCardPayment({");
  // A partir do inicio da CHAMADA, e nao do arquivo: `finalizeCharge` tambem
  // aparece no import, no topo, e a fatia saia vazia.
  const chamada = rota.slice(inicio, rota.indexOf("finalizeCharge({", inicio));

  assert.ok(inicio > 0 && chamada.length > 0, "chamada de createCardPayment nao encontrada");

  const doCorpo = [...chamada.matchAll(/body\?\.(\w+)/g)].map((match) => match[1]);

  assert.deepEqual(
    [...new Set(doCorpo)].sort(),
    ["deviceId", "issuerId"],
    "so o dispositivo e o emissor podem vir do corpo"
  );
});

// `payer.address` e `additional_info.shipments.receiver_address` usam nomes
// DIFERENTES para a mesma coisa: o primeiro quer `city`, o segundo `city_name`.
//
// Uma chamada real ao sandbox recusou a cobranca inteira com
// "The name of the following parameters is wrong: [payer.address.city_name]".
// Nome errado aqui nao piora a pontuacao — derruba o pagamento.
test("o endereco de entrega traduz o nome dos campos", () => {
  // Exatamente o que `resolvePayerAddress` devolve.
  const doResolver = {
    city: "Maringa",
    federal_unit: "PR",
    neighborhood: "Centro",
    street_name: "Avenida Brasil",
    street_number: "1200",
    zip_code: "87013000"
  };

  const info = buildAdditionalInfo({ address: doResolver, items: [], order: PEDIDO });

  assert.equal(info.shipments.receiver_address.city_name, "Maringa");
  assert.equal(info.shipments.receiver_address.state_name, "PR");

  // E o pagador continua recebendo o objeto original, com `city`.
  const payer = buildPayerFromOrder(PEDIDO, doResolver);

  assert.equal(payer.address.city, "Maringa");
  assert.equal(payer.address.city_name, undefined, "city_name em payer.address derruba a cobranca");
});
