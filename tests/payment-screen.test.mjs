import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  isOnlinePaymentMethod,
  listPaymentMethods,
  paymentMethods
} from "../src/checkout/whatsapp.js";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

function semComentarios(codigo) {
  return codigo.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/[^\n]*$/gm, "");
}

// ---------------------------------------------------------------------------
// O fluxo do WhatsApp continua existindo
// ---------------------------------------------------------------------------

// Decisao travada do dono: quem escolhe "combinar" ou "dinheiro" nao quer pagar
// pelo site. Mandar essas opcoes para a tela de pagamento quebraria a loja para
// exatamente o cliente que ela ja atendia.
test("dinheiro e combinar nao sao pagamento online", () => {
  assert.equal(isOnlinePaymentMethod("combinar"), false);
  assert.equal(isOnlinePaymentMethod("dinheiro"), false);
  assert.equal(isOnlinePaymentMethod("pix"), true);
  assert.equal(isOnlinePaymentMethod("cartao"), true);
  assert.equal(isOnlinePaymentMethod("boleto"), true);
});

test("as tres formas online estao no seletor do carrinho", () => {
  const online = paymentMethods.filter((metodo) => metodo.online).map((metodo) => metodo.id);

  assert.deepEqual(online.sort(), ["boleto", "cartao", "pix"]);
});

// Boleto so existe porque o provedor emite. Com o pagamento desligado, ele
// viraria trabalho manual que o operador nunca combinou de fazer — e um deploy
// nao pode adicionar forma de pagamento a revelia do dono.
test("boleto nao aparece com o pagamento online desligado", () => {
  const desligado = listPaymentMethods().map((metodo) => metodo.id);
  const ligado = listPaymentMethods({ isOnlinePaymentEnabled: true }).map((metodo) => metodo.id);

  assert.equal(desligado.includes("boleto"), false);
  assert.ok(ligado.includes("boleto"));

  // O que ja era combinado no atendimento continua nos dois casos.
  for (const metodo of ["pix", "cartao", "dinheiro", "combinar"]) {
    assert.ok(desligado.includes(metodo), `${metodo} deveria continuar na lista`);
  }
});

// Prometer "enviar no WhatsApp" e abrir uma tela de cobranca e a pior surpresa
// possivel no momento em que o cliente decide pagar.
test("o botao do carrinho diz para onde vai", async () => {
  const painel = await source("src/components/catalog/checkout-summary-panel.js");

  assert.match(painel, /isOnlinePaymentEnabled && isOnlinePaymentMethod\(paymentMethodId\)/);
  assert.match(painel, /paysOnline \? \(\s*"Ir para o pagamento"/);
  assert.match(
    painel,
    /aria-label=\{paysOnline \? "Ir para o pagamento" : "Enviar pedido no WhatsApp"\}/
  );

  // O preview da mensagem do WhatsApp nao faz sentido no fluxo de cobranca.
  assert.match(painel, /paysOnline \? null : \(\s*<textarea/);
});

// O id do pedido e a credencial da pagina: ela nao pode acabar num indice de
// busca porque alguem colou o link em algum lugar publico.
test("a tela de pagamento pede noindex", async () => {
  const pagina = await source("app/pedido/pagamento/[orderId]/page.js");
  const robots = await source("app/robots.js");

  assert.match(pagina, /robots: \{ follow: false, index: false \}/);
  assert.match(robots, /"\/pedido"/);
});

test("o seletor do carrinho usa a lista filtrada", async () => {
  const painel = await source("src/components/catalog/checkout-summary-panel.js");

  assert.equal(painel.includes("{paymentMethods.map("), false);
  assert.match(painel, /listPaymentMethods\(\{ isOnlinePaymentEnabled \}\)/);
});

test("o checkout so redireciona quando o pagamento online esta ligado", async () => {
  const hook = await source("src/components/catalog/hooks/use-checkout.js");

  assert.match(hook, /isOnlinePaymentEnabled && isOnlinePaymentMethod\(paymentMethodId\)/);
  assert.match(hook, /window\.location\.assign\(`\/pedido\/pagamento\/\$\{data\.order\.id\}`\)/);

  // Sem pedido gravado nao existe o que cobrar.
  assert.match(hook, /!data\.order\?\.saved \|\| !data\.order\?\.id/);
});

// A janela do WhatsApp precisa nascer dentro do gesto do usuario. Abrir depois
// do fetch faz o navegador tratar como pop-up e bloquear.
test("o fluxo do WhatsApp continua abrindo a janela antes do fetch", async () => {
  const hook = await source("src/components/catalog/hooks/use-checkout.js");
  const trecho = hook.slice(
    hook.indexOf("async function submitCheckout"),
    hook.indexOf("await fetch")
  );

  assert.match(trecho, /paysOnline \? null : window\.open\("", "_blank"\)/);
});

// ---------------------------------------------------------------------------
// A rota de status nao vaza numero interno
// ---------------------------------------------------------------------------

test("a consulta de status nao devolve taxa, custo nem margem", async () => {
  const rota = await source("app/api/pagamento/status/route.js");
  const select = rota.match(/from\("payments"\)\s*\.select\(\s*"([^"]*)"/)?.[1] ?? "";

  assert.ok(select, "select de payments nao encontrado");

  for (const proibido of [
    "provider_fee_cents",
    "settled_amount_cents",
    "refunded_amount_cents",
    "provider_payload",
    "provider_payment_id"
  ]) {
    assert.equal(select.includes(proibido), false, `a rota de status expoe ${proibido}`);
  }

  assert.equal(rota.includes("order_ledger"), false, "a rota de status nao pode ler o ledger");
});

test("a consulta de status so le, nunca escreve", async () => {
  const rota = semComentarios(await source("app/api/pagamento/status/route.js"));

  for (const escrita of [".update(", ".insert(", ".upsert(", ".delete("]) {
    assert.equal(rota.includes(escrita), false, `a rota de status nao pode chamar ${escrita}`);
  }

  assert.match(rota, /export async function GET/);
  assert.equal(rota.includes("export async function POST"), false);
});

// Polling e trafego legitimo e repetido do MESMO cliente: um limite apertado
// derrubaria a tela justamente enquanto ela espera a confirmacao.
test("a consulta de status tem perfil de rate limit proprio e largo", async () => {
  const limites = await source("src/lib/rate-limit.js");
  const perfil = limites.slice(
    limites.indexOf("paymentStatus:"),
    limites.indexOf("paymentWebhook:")
  );

  assert.match(perfil, /scope: "payment-status"/);
  assert.match(perfil, /limit: 120/);

  const rota = await source("app/api/pagamento/status/route.js");
  assert.match(rota, /rateLimitProfiles\.paymentStatus/);
});

// Status muda por webhook: uma resposta em cache mostraria "aguardando" para um
// pedido ja pago.
test("nem a rota nem a pagina de pagamento sao cacheadas", async () => {
  const rota = await source("app/api/pagamento/status/route.js");
  const pagina = await source("app/pedido/pagamento/[orderId]/page.js");

  assert.match(rota, /"cache-control": "no-store"/);
  assert.match(pagina, /export const dynamic = "force-dynamic"/);
});

// ---------------------------------------------------------------------------
// A pagina de pagamento
// ---------------------------------------------------------------------------

// O id do pedido e a credencial da pagina. Por isso daqui so sai o que o
// proprio cliente ja sabe — nome, endereco e e-mail ficam de fora.
// Lista negra em vez de igualdade exata: a pagina pode precisar de mais um
// campo operacional (created_at entrou para a validade do link), mas nao pode
// nunca puxar dado pessoal — quem tem o link nao provou ser o dono do pedido.
test("a pagina de pagamento nao le dado pessoal do cliente", async () => {
  const pagina = await source("app/pedido/pagamento/[orderId]/page.js");
  const select = pagina.match(/from\("orders"\)\s*\.select\("([^"]*)"\)/)?.[1] ?? "";

  assert.ok(select, "select de orders nao encontrado");

  for (const campo of ["order_number", "total_cents", "payment_status"]) {
    assert.ok(select.includes(campo), `a tela precisa de ${campo}`);
  }

  for (const proibido of [
    "customer_name",
    "customer_email",
    "customer_whatsapp",
    "customer_phone",
    "customer_tax_id",
    "address_snapshot",
    "customer_snapshot",
    "internal_notes",
    "original_message"
  ]) {
    assert.equal(select.includes(proibido), false, `a tela de pagamento expoe ${proibido}`);
  }
});

test("a pagina de pagamento recusa id fora do formato e loja com pagamento desligado", async () => {
  const pagina = await source("app/pedido/pagamento/[orderId]/page.js");

  assert.match(pagina, /!isOnlinePaymentEnabled\(\) \|\| !ORDER_ID_PATTERN\.test/);
  assert.match(pagina, /notFound\(\)/);
});

// ---------------------------------------------------------------------------
// Cartao
// ---------------------------------------------------------------------------

// O numero e o CVV sao tokenizados no navegador. Se algum dia forem enviados no
// corpo, este teste quebra antes de virar um incidente de PCI.
test("o cartao envia so o token para o nosso servidor", async () => {
  const tela = await source("src/components/payment/payment-experience.js");
  const envio = tela.slice(
    tela.indexOf('postJson("/api/pagamento/cartao"'),
    tela.indexOf("onMensagem(resposta")
  );

  assert.match(envio, /cardToken: token\.id/);

  for (const proibido of ["cardNumber", "securityCode", "cardExpiration"]) {
    assert.equal(envio.includes(proibido), false, `o corpo do cartao nao pode levar ${proibido}`);
  }
});

test("o SDK do provedor entra por script-src, sem checkout embutido", async () => {
  const tela = await source("src/components/payment/payment-experience.js");
  const headers = await source("src/security/headers.js");

  assert.match(tela, /https:\/\/sdk\.mercadopago\.com\/js\/v2/);
  assert.match(headers, /script-src[^"]*https:\/\/sdk\.mercadopago\.com/);
  assert.match(headers, /"frame-src 'none'"/);
});

// ---------------------------------------------------------------------------
// Animacao
// ---------------------------------------------------------------------------

// O projeto respeita prefers-reduced-motion em 4 arquivos CSS. A tela nova nao
// pode ser a excecao so porque anima por JavaScript.
test("a tela respeita prefers-reduced-motion", async () => {
  const tela = await source("src/components/payment/payment-experience.js");
  const css = await source("src/components/payment/payment-experience.module.css");

  assert.match(tela, /useReducedMotion/);
  assert.match(tela, /reduzido \? \{ duration: 0 \} : MOLA/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});

test("a animacao vem de motion, nunca de framer-motion", async () => {
  const tela = await source("src/components/payment/payment-experience.js");

  assert.match(tela, /from "motion\/react"/);
  assert.equal(tela.includes("framer-motion"), false);
});

// Cor por token: o mesmo CSS serve os dois temas sem uma linha a mais.
test("a tela de pagamento nao tem cor fora dos tokens", async () => {
  const css = await source("src/components/payment/payment-experience.module.css");
  const declaracoes = css
    .split("\n")
    .filter((linha) => /(?:^|[^-])color:|background:|background-color:/.test(linha))
    .filter((linha) => !linha.trim().startsWith("*"));

  for (const linha of declaracoes) {
    const usaToken = linha.includes("var(--");
    // #ffffff sobrevive em dois lugares: o fundo do QR Code, que precisa ser
    // branco para o app do banco ler, e o "check" sobre o verde de sucesso.
    const brancoIntencional = /#ffffff/.test(linha);

    assert.ok(
      usaToken || brancoIntencional || linha.includes("none"),
      `cor fora dos tokens: ${linha.trim()}`
    );
  }
});
