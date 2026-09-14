import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { formatCardExpiryInput, parseCardExpiry } from "../src/payments/card-expiry.js";

// Data fixa: sem ela o teste do cartao vencido passaria hoje e falharia em
// janeiro, e ninguem entenderia por que.
const HOJE = new Date("2026-09-03T12:00:00Z");

test("aceita o vencimento como vem impresso no cartao", () => {
  assert.deepEqual(parseCardExpiry("09/29", HOJE), { month: "09", year: "2029" });
  assert.deepEqual(parseCardExpiry("12/2030", HOJE), { month: "12", year: "2030" });

  // O cliente digita como quer; a barra e enfeite.
  assert.deepEqual(parseCardExpiry("0929", HOJE), { month: "09", year: "2029" });
  assert.deepEqual(parseCardExpiry(" 09 / 29 ", HOJE), { month: "09", year: "2029" });
});

test("o mes atual ainda vale", () => {
  // Cartao vence no FIM do mes impresso: 09/2026 ainda paga em setembro de 2026.
  assert.deepEqual(parseCardExpiry("09/26", HOJE), { month: "09", year: "2026" });
});

test("recusa o que o provedor recusaria, antes de tokenizar", () => {
  const invalidos = [
    ["", "vazio"],
    ["1", "incompleto"],
    ["09/2", "ano pela metade"],
    ["00/29", "mes zero"],
    ["13/29", "mes 13"],
    ["08/26", "mes passado"],
    ["09/25", "ano passado"],
    ["09/99", "validade longa demais"],
    ["ab/cd", "letras"]
  ];

  for (const [valor, motivo] of invalidos) {
    assert.equal(parseCardExpiry(valor, HOJE), null, `${motivo} deveria ser recusado: ${valor}`);
  }
});

test("a barra aparece sozinha enquanto digita", () => {
  assert.equal(formatCardExpiryInput("0"), "0");
  assert.equal(formatCardExpiryInput("09"), "09");
  assert.equal(formatCardExpiryInput("092"), "09/2");
  assert.equal(formatCardExpiryInput("0929"), "09/29");

  // Quem digita a barra na mao nao ganha duas.
  assert.equal(formatCardExpiryInput("09/29"), "09/29");

  // Letra e simbolo somem em vez de travar o campo.
  assert.equal(formatCardExpiryInput("0a9b/2c9"), "09/29");

  // Nao cresce alem do que cabe num vencimento.
  assert.equal(formatCardExpiryInput("09292929"), "09/2929");
});

// Apagar precisa funcionar. Se a barra fosse recolocada quando o texto termina
// nela, o backspace ficaria preso no separador e o campo pareceria travado.
test("apagar nao fica preso na barra", () => {
  assert.equal(formatCardExpiryInput("09/"), "09");
  assert.equal(formatCardExpiryInput("09"), "09");
  assert.equal(formatCardExpiryInput("0"), "0");
  assert.equal(formatCardExpiryInput(""), "");
});

// ---------------------------------------------------------------------------
// A tela usa o que este modulo decide
// ---------------------------------------------------------------------------

test("a tela recusa a validade antes de mandar o cartao para o provedor", async () => {
  const tela = await readFile(
    new URL("../src/components/payment/payment-experience.js", import.meta.url),
    "utf8"
  );

  const bloco = tela.slice(tela.indexOf("const vencimento = parseCardExpiry"));

  // A validacao vem ANTES da tokenizacao: mandar um vencimento invalido para o
  // SDK devolveria um erro generico em ingles.
  assert.ok(
    bloco.indexOf("throw new Error") < bloco.indexOf("createCardToken"),
    "a validade precisa ser conferida antes de tokenizar"
  );

  assert.match(bloco, /cardExpirationMonth: vencimento\.month/);
  assert.match(bloco, /cardExpirationYear: vencimento\.year/);
});

// Debito sai da conta de uma vez. Um seletor de parcelas no debito ofereceria
// algo que o provedor recusa na cobranca.
test("debito nao mostra parcelamento", async () => {
  const tela = await readFile(
    new URL("../src/components/payment/payment-experience.js", import.meta.url),
    "utf8"
  );

  assert.match(tela, /aceitaParcelar = tipoEscolhido\?\.id !== "debit_card"/);
  assert.match(tela, /\{aceitaParcelar \? \(/);
  assert.match(tela, /payment_type_id === "debit_card" \? 1 :/);
});

// O tipo do cartao vem do PROVEDOR, pelo bin — nao de uma lista nossa. A conta
// da loja hoje nem tem debito habilitado, entao a lista volta com um tipo so e
// o seletor nao aparece. Fixar as opcoes no codigo criaria uma escolha que
// seria recusada na cobranca.
test("o tipo do cartao vem do provedor, nao de uma lista fixa", async () => {
  const tela = await readFile(
    new URL("../src/components/payment/payment-experience.js", import.meta.url),
    "utf8"
  );

  const bloco = tela.slice(
    tela.indexOf("function useCardPaymentTypes"),
    tela.indexOf("function useInstallments")
  );

  assert.match(bloco, /sdk\.getPaymentMethods\(\{ bin \}\)/);
  assert.match(bloco, /metodo\?\.payment_type_id/);

  // O seletor so aparece com mais de um trilho disponivel.
  assert.match(tela, /\{tipos\.length > 1 \? \(/);
});
