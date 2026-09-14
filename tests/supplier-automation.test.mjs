import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

import { buildAutomationKey } from "../src/payments/supplier-automation.js";

const MIGRACAO_PREPARO = "supabase/migrations/20260903183000_prepare_supplier_purchases.sql";

// Um comentario que EXPLICA por que algo foi removido contem o proprio termo
// proibido. Sem tirar comentario, a documentacao da correcao derruba o teste que
// verifica a correcao — ja aconteceu mais de uma vez neste projeto.
function semComentarios(codigo) {
  return codigo.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/[^\n]*$/gm, "");
}

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

// ---------------------------------------------------------------------------
// A automacao NAO compra no fornecedor
// ---------------------------------------------------------------------------

// Decisao travada do dono da loja: automatizar so o fluxo interno. A compra em
// Shopee/AliExpress continua sendo um ato humano. Este teste existe para que
// ninguem "complete" a automacao depois sem essa conversa acontecer de novo.
test("a automacao nao fala com nenhum fornecedor", async () => {
  const codigo = await source("src/payments/supplier-automation.js");
  const semComentarios = codigo.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/[^\n]*$/gm, "");

  for (const proibido of ["shopee", "aliexpress", "puppeteer", "playwright"]) {
    assert.equal(
      semComentarios.toLowerCase().includes(proibido),
      false,
      `automacao nao pode conhecer ${proibido}`
    );
  }

  // Nenhuma chamada de rede: a automacao so escreve no proprio banco.
  assert.equal(semComentarios.includes("fetch("), false);
});

// ---------------------------------------------------------------------------
// Idempotencia
// ---------------------------------------------------------------------------

// Webhook reenviado, evento fora de ordem e duas requisicoes simultaneas
// produzem a MESMA chave — e a UNIQUE parcial no banco recusa a segunda.
test("a chave de idempotencia depende do pedido E da loja", () => {
  const pedido = "11111111-1111-1111-1111-111111111111";

  // Mesma loja, mesma chave: e o que faz o webhook reenviado nao criar a
  // segunda compra.
  assert.equal(
    buildAutomationKey(pedido, "shopee:alfa"),
    buildAutomationKey(pedido, "shopee:alfa")
  );

  // Lojas diferentes no MESMO pedido precisam de chaves diferentes. Sem isso, o
  // pedido com itens de duas lojas viraria uma compra so e a segunda loja nunca
  // seria comprada — com o cliente ja tendo pago pelos dois itens.
  assert.notEqual(
    buildAutomationKey(pedido, "shopee:alfa"),
    buildAutomationKey(pedido, "aliexpress:beta")
  );

  assert.notEqual(
    buildAutomationKey(pedido, "shopee:alfa"),
    buildAutomationKey("outro", "shopee:alfa")
  );

  assert.match(buildAutomationKey(pedido, "shopee:alfa"), new RegExp(pedido));

  // Produto sem origem cadastrada cai num grupo de verdade, nao em `undefined`.
  assert.match(buildAutomationKey(pedido), /:loja:sem_loja$/);
});

// A chave e montada em DOIS lugares: aqui e dentro de
// `prepare_supplier_purchases`. Se as duas concatenacoes divergirem, o webhook
// reenviado cria a segunda compra da mesma loja e o operador compra duas vezes.
test("a aplicacao e o banco montam a chave do mesmo jeito", async () => {
  const sql = await source(MIGRACAO_PREPARO);

  assert.match(sql, /v_chave := p_automation_prefix \|\| ':loja:' \|\| v_grupo\.chave;/);
  assert.equal(buildAutomationKey("PEDIDO", "LOJA"), "pedido:PEDIDO:loja:LOJA");
});

test("a chave usa o indice unico criado na migracao", async () => {
  const sql = await source("supabase/migrations/20260825120000_payment_ledger_and_webhooks.sql");

  assert.match(
    sql,
    /create unique index if not exists supplier_purchases_automation_key_idx[\s\S]*?where automation_key is not null/
  );
});

test("reentrega do webhook e tratada como ja executada, nao como erro", async () => {
  const codigo = await source("src/payments/supplier-automation.js");
  const sql = await source(MIGRACAO_PREPARO);

  // A recusa acontece no banco, no indice unico parcial de `automation_key`.
  assert.match(sql, /on conflict \(automation_key\) where automation_key is not null do nothing/);

  // Segunda invariante, e a mais importante: um item de pedido nunca entra em
  // duas compras. E ela que faz o agrupamento ser uma particao de verdade.
  assert.match(sql, /on conflict \(order_item_id\) do nothing/);

  // Nada criado devolve "ja_executada", que e o que impede o segundo e-mail ao
  // operador — ele so sai quando o motivo e "criada".
  assert.match(codigo, /motivo: "ja_executada", ok: true/);
});

// ---------------------------------------------------------------------------
// Desfazer
// ---------------------------------------------------------------------------

// Apagar uma compra que o operador ja fez destruiria o registro de um gasto
// real. Nesse caso a linha fica, marcada como problema.
test("desfazer so remove compra intocada pelo operador", async () => {
  const codigo = await source("src/payments/supplier-automation.js");

  assert.match(codigo, /source_status === "nao_comprado"/);
  assert.match(codigo, /source_status: "problema"/);
  assert.match(codigo, /Compra já iniciada/);
});

// `.eq("automation_key", …).maybeSingle()` ERRA assim que o pedido tem duas
// compras — e com o agrupamento por loja isso virou o caso comum, nao a
// excecao. Filtrar por pedido tambem cobre a chave antiga, sem sufixo de loja.
test("desfazer aguenta um pedido com varias lojas", async () => {
  const codigo = await source("src/payments/supplier-automation.js");
  const inicio = codigo.indexOf("export async function undoSupplierAutomation");

  // Ate a proxima funcao, e nao ate o fim do arquivo: `reverseLedger` vem
  // depois e usa `maybeSingle()` com razao — ledger e um por pedido.
  const fim = codigo.indexOf("export async function reverseLedger");
  const bloco = semComentarios(codigo.slice(inicio, fim > inicio ? fim : undefined));

  assert.match(bloco, /\.eq\("order_id", orderId\)/);
  assert.equal(
    bloco.includes("maybeSingle()"),
    false,
    "maybeSingle() erra com duas ou mais compras no mesmo pedido"
  );
});

test("o estorno do ledger sinaliza repasse ja executado", async () => {
  const codigo = await source("src/payments/supplier-automation.js");

  assert.match(codigo, /payout_status: "estornado"/);
  assert.match(codigo, /repasse ja executado, exige devolucao/i);
});

// `recusado` e `expirado` ficam de fora: neles a automacao nunca rodou.
test("so estados de dinheiro-de-volta disparam o desfazer", async () => {
  const rota = await source("app/api/pagamento/webhook/route.js");
  const linha = rota.match(/const REVERSOES = new Set\(\[([^\]]*)\]\)/)?.[1] ?? "";

  for (const estado of ["reembolsado", "estornado", "cancelado"]) {
    assert.match(linha, new RegExp(`"${estado}"`), `${estado} deveria desfazer`);
  }

  for (const estado of ["recusado", "expirado", "autorizado"]) {
    assert.equal(linha.includes(`"${estado}"`), false, `${estado} nao deveria desfazer`);
  }
});

// ---------------------------------------------------------------------------
// Gatilho e efeitos
// ---------------------------------------------------------------------------

test("a automacao dispara so na confirmacao do pagamento", async () => {
  const rota = await source("app/api/pagamento/webhook/route.js");
  const bloco = rota.slice(
    rota.indexOf('providerPayment.status === "pagamento_confirmado"'),
    rota.indexOf("REVERSOES.has")
  );

  assert.match(bloco, /applyConfirmedPaymentEffects/);

  const efeitos = await source("src/payments/confirmed-payment.js");
  assert.match(efeitos, /runSupplierAutomation/);
  assert.match(efeitos, /upsertProvisionalLedger/);
});

// Cartao aprovado na hora nao gera evento de MUDANCA: a rota de cobranca ja
// gravou o status final, e o webhook seguinte ve "status inalterado". Sem os
// dois caminhos passando pelo mesmo ponto, esse pedido ficava sem ledger e sem
// compra interna — foi o que uma cobranca real de sandbox revelou.
test("cartao aprovado na hora tambem dispara os efeitos", async () => {
  const rota = await source("app/api/pagamento/cartao/route.js");
  const escrituracao = await source("src/payments/charge-flow.js");

  assert.match(rota, /finalizeCharge\(\{/);

  const bloco = escrituracao.slice(
    escrituracao.indexOf('charge.status !== "pagamento_confirmado"')
  );
  assert.match(bloco, /applyConfirmedPaymentEffects/);
});

test("o webhook conserta o pedido quando o status ja estava confirmado", async () => {
  const rota = await source("app/api/pagamento/webhook/route.js");
  const bloco = rota.slice(
    rota.indexOf('result.reason === "status_inalterado"'),
    rota.indexOf("if (!result.applied) {")
  );

  assert.match(bloco, /applyConfirmedPaymentEffects/);
});

// O pedido tambem tem que sair de "aguardando pagamento" — o painel e o
// rastreio publico leem esse campo, nao o da tabela de pagamentos.
test("os efeitos marcam o pedido como pago", async () => {
  const efeitos = await source("src/payments/confirmed-payment.js");

  assert.match(efeitos, /from\("orders"\)[\s\S]*?payment_status: STATUS_CONFIRMADO/);
});

test("a automacao registra rastreio e auditoria", async () => {
  const codigo = await source("src/payments/supplier-automation.js");
  const sql = await source(MIGRACAO_PREPARO);

  // Ao preparar, quem grava e a RPC — junto com as compras, na mesma transacao.
  assert.match(sql, /insert into public\.supplier_tracking_events/);
  assert.match(sql, /'automacao_compra_interna_criada'/);

  // Ao desfazer, quem grava e a aplicacao.
  assert.match(codigo, /from\("supplier_tracking_events"\)/);
  assert.match(codigo, /action: "automacao_compra_interna_desfeita"/);
});

// Tres eventos iguais no mesmo pedido diriam ao cliente que a compra dele foi
// partida entre tres fornecedores. Um evento por pedido, sempre.
test("o rastreio nao denuncia quantas lojas o pedido tem", async () => {
  const sql = await source(MIGRACAO_PREPARO);

  // O insert do evento vem DEPOIS do laco por loja, nao dentro dele.
  assert.ok(
    sql.indexOf("end loop;") < sql.indexOf("insert into public.supplier_tracking_events"),
    "o evento de rastreio nao pode estar dentro do laco por loja"
  );

  const bloco = sql.slice(sql.indexOf("if v_criadas > 0 then"));

  assert.match(bloco, /insert into public\.supplier_tracking_events/);
  // E nao aponta para uma compra especifica, que revelaria a divisao.
  assert.match(bloco, /supplier_purchase_id[\s\S]{0,200}?null/);
});

// O operador pode ter movido o pedido adiante antes de o webhook chegar. A
// automacao nao pode puxar o status de volta.
test("o status so avanca, nunca retrocede", async () => {
  const sql = await source(MIGRACAO_PREPARO);
  const bloco = sql.slice(
    sql.indexOf("if v_operational_status in ("),
    sql.indexOf("if v_criadas > 0 then")
  );

  assert.match(bloco, /update public\.orders/);
  assert.match(bloco, /set operational_status = 'compra_interna_pendente'/);

  for (const status of ["compra_interna_realizada", "em_transito", "entregue", "cancelado"]) {
    assert.equal(bloco.includes(`'${status}'`), false, `${status} nao pode permitir voltar`);
  }
});

// A lista de status anteriores existe DUAS vezes: derivada da linha do tempo em
// src/payments/supplier-automation.js e escrita a mao dentro da RPC. Um status
// novo na linha do tempo que nao chegue ao SQL deixaria o pedido parado depois
// de pago, sem nada apontando o erro.
test("a lista de status anteriores e a mesma no codigo e no banco", async () => {
  const { STATUS_ANTES_DA_COMPRA } = await import("../src/payments/supplier-automation.js");
  const sql = await source(MIGRACAO_PREPARO);
  const inicio = sql.indexOf("if v_operational_status in (");
  const bloco = sql.slice(inicio, sql.indexOf(") then", inicio));

  const noSql = [...bloco.matchAll(/'([a-z_]+)'/g)].map((match) => match[1]);

  assert.deepEqual(noSql, STATUS_ANTES_DA_COMPRA);
});

// Pedido pago pelo site nasce em `enviado_whatsapp_business` e nunca passa por
// `pagamento_confirmado` no campo OPERACIONAL. Exigir esse valor deixava o
// status parado depois de uma cobranca real de cartao.
test("os estados anteriores a compra saem da propria linha do tempo", async () => {
  const { operationalStatuses } = await import("../src/orders/status.js");
  const linha = operationalStatuses.map((status) => status.id);
  const antes = linha.slice(0, linha.indexOf("compra_interna_pendente"));

  for (const status of [
    "enviado_whatsapp_business",
    "aguardando_pagamento",
    "pagamento_confirmado"
  ]) {
    assert.ok(antes.includes(status), `${status} deveria permitir avancar`);
  }

  for (const status of [
    "compra_interna_realizada",
    "em_transito",
    "entregue",
    "cancelado",
    "problema_envio"
  ]) {
    assert.equal(antes.includes(status), false, `${status} nao pode ser puxado de volta`);
  }
});

// Perder o aviso e um incomodo; desfazer o pagamento por causa dele seria um
// estrago. O e-mail falha em silencio registrado.
test("falha de e-mail nao derruba a automacao", async () => {
  const codigo = await source("src/payments/supplier-automation-email.js");

  assert.match(codigo, /catch \(error\)/);
  assert.match(codigo, /automacao_email_operador_falhou/);
  assert.match(codigo, /return \{ motivo: "falha-no-envio", enviado: false \}/);
});

// ---------------------------------------------------------------------------
// Vazamento
// ---------------------------------------------------------------------------

test("o rastreio publico nao expoe fornecedor, custo nem origem da linha", async () => {
  // As DUAS superficies publicas: /rastreio (sem login) e /conta (logado).
  // Antes so a primeira era coberta, e nada impedia a segunda de trocar o
  // select por `select("*")`.
  for (const arquivo of ["src/tracking/order-tracking.js", "src/reviews/order-reviews.js"]) {
    // Sem comentario: a explicacao de por que uma coluna FICA DE FORA cita o
    // nome dela, e derrubaria o teste que verifica exatamente isso.
    const codigo = semComentarios(await source(arquivo));
    const select = codigo.match(/from\("supplier_purchases"\)\s*\.select\("([^"]*)"\)/)?.[1] ?? "";

    assert.ok(select, `select de supplier_purchases nao encontrado em ${arquivo}`);

    for (const proibido of [
      // O codigo do fornecedor e o pior deles: rastrea-lo mostra "Shopee" ou
      // "AliExpress" na transportadora, o remetente e o endereco de origem.
      "tracking_code",
      "source_order_number",
      "source_store_name",
      "source_product_url",
      "product_cost_cents",
      "shipping_cost_cents",
      "internal_channel",
      "internal_notes",
      "created_by",
      "automation_key"
    ]) {
      assert.equal(select.includes(proibido), false, `${arquivo} expoe ${proibido}`);
    }
  }
});

// A coluna sai da PROJECAO, nao e removida depois de lida. Assim o valor nunca
// chega a existir na memoria do servidor, e nenhum log, erro serializado ou
// prop de componente pode derruba-lo por acidente.
test("as telas do cliente nao renderizam o codigo do fornecedor", async () => {
  for (const arquivo of [
    "src/components/tracking/tracking-lookup.js",
    "app/conta/page.js",
    "src/tracking/order-tracking.js",
    "src/reviews/order-reviews.js"
  ]) {
    const codigo = semComentarios(await source(arquivo));

    assert.equal(
      /trackingCode|tracking_code/.test(codigo),
      false,
      `${arquivo} ainda menciona o codigo de rastreio`
    );
  }
});

// Fechar as colunas nao fecha um "rastreio SP123456789" digitado na descricao,
// que e texto livre renderizado para o cliente.
test("a descricao do rastreio recusa o codigo do fornecedor", async () => {
  const codigo = await source("src/admin/order-operation.js");
  const painel = await source("app/admin/_components/admin-orders-view.js");

  assert.match(codigo, /rejectDescriptionLeaks/);
  assert.match(codigo, /tracking_code, source_order_number/);
  assert.match(codigo, /nao pode conter o codigo/);

  // E o operador e avisado antes de digitar.
  assert.match(painel, /Este texto aparece para o cliente/);
});

test("o painel admin distingue o que foi automatico do que foi manual", async () => {
  const painel = await source("app/admin/_components/admin-orders-view.js");

  assert.match(painel, /created_by === "automacao"/);
  assert.match(painel, /criada pela automação/);
  // `\s+` no lugar do espaco: o Prettier decide onde quebrar a frase em funcao
  // do tamanho da linha, e a versao contigua deixou de bater quando o bloco
  // virou um componente indentado. O que importa e a frase existir.
  assert.match(painel, /precisa ser feita\s+por uma pessoa/);
});

// Cada loja e uma compra, e o operador precisa ver a lista do que comprar em
// cada uma. Enquanto o painel lia `supplierPurchases?.[0]`, o segundo
// fornecedor de um pedido simplesmente nao aparecia — e nunca era comprado.
test("o painel mostra uma compra por loja, com os itens de cada uma", async () => {
  const painel = await source("app/admin/_components/admin-orders-view.js");
  const admin = await source("src/admin/order-admin.js");

  assert.match(painel, /supplierPurchases\.map|\[\.\.\.supplierPurchases, null\]\.map/);
  assert.match(painel, /Abrir no fornecedor/);
  assert.match(painel, /name="supplierBlockCount"/);

  // Campos indexados por bloco, e nao um nome unico repetido.
  assert.match(painel, /sourceStatus__\$\{indice\}/);

  assert.equal(
    semComentarios(admin).includes("supplierPurchases?.[0]"),
    false,
    "ler so a primeira compra esconde as outras lojas do operador"
  );
});

// ---------------------------------------------------------------------------
// A promessa vale para o projeto, nao para um arquivo
// ---------------------------------------------------------------------------

// O teste acima guarda `supplier-automation.js`. Sozinho ele nao impede que a
// compra em marketplace apareca num arquivo NOVO — e a decisao do dono da loja
// e sobre o sistema, nao sobre um modulo. Estes dois fecham isso.

// Comprar sozinho na Shopee ou no AliExpress exigiria dirigir um navegador:
// nenhuma das duas tem API publica de compra. Se um pacote desses entrar em
// `dependencies`, a conversa precisa acontecer de novo antes.
test("nenhum condutor de navegador entra no que vai para producao", async () => {
  const pacote = JSON.parse(await source("package.json"));
  const producao = Object.keys(pacote.dependencies ?? {});

  const condutores = producao.filter((nome) =>
    /puppeteer|playwright|selenium|webdriver|cheerio|scrape|crawl/i.test(nome)
  );

  assert.deepEqual(
    condutores,
    [],
    "automatizar compra em marketplace comeca por aqui — decisao do dono, nao do codigo"
  );
});

// O servidor fala com o provedor de pagamento e com a busca de CEP. Mais nada.
// Um host novo aparecendo aqui e a evidencia mais direta de que o sistema
// passou a conversar com alguem que ninguem combinou.
test("o servidor so fala com o provedor de pagamento e a busca de CEP", async () => {
  const permitidos = new Set(["api.mercadopago.com", "viacep.com.br"]);
  const encontrados = new Set();

  async function varrer(dir) {
    for (const entrada of await readdir(new URL(`../${dir}`, import.meta.url), {
      withFileTypes: true
    })) {
      const caminho = `${dir}/${entrada.name}`;

      if (entrada.isDirectory()) {
        await varrer(caminho);
      } else if (entrada.name.endsWith(".js")) {
        // Comentario citando uma URL e documentacao, nao chamada de rede.
        const codigo = (await source(caminho))
          .replace(/\/\*[\s\S]*?\*\//g, "")
          .replace(/^\s*\/\/[^\n]*$/gm, "");

        // O host precisa ter a forma de host: rotulos separados por ponto, com
        // letra ou numero em cada um. Sem essa exigencia, o "https://" citado
        // numa MENSAGEM de erro ("o link precisa comecar com https://") entrava
        // como se fosse um destino de rede — falso positivo que ja aconteceu.
        for (const [, host] of codigo.matchAll(
          /https?:\/\/([a-z0-9][a-z0-9-]*(?:\.[a-z0-9][a-z0-9-]*)+)/gi
        )) {
          encontrados.add(host.toLowerCase());
        }
      }
    }
  }

  await varrer("src/payments");
  await varrer("src/admin");
  await varrer("app/api");

  const inesperados = [...encontrados].filter((host) => !permitidos.has(host));

  assert.deepEqual(inesperados, []);
});

// Um pedido pode virar VARIAS compras, uma por loja. Sem a lista, o aviso diria
// "a compra esta pendente" para um pedido com tres compras a fazer — e duas
// seriam esquecidas.
test("o aviso ao operador diz quantas lojas ele precisa comprar", async () => {
  const email = await source("src/payments/supplier-automation-email.js");
  const orquestracao = await source("src/payments/confirmed-payment.js");

  assert.match(email, /compras, order, painelUrl/);
  assert.match(email, /\$\{quantas\} compras/);
  assert.match(email, /Comprar em \$\{quantas\} lojas/);

  // O grupo sem origem precisa aparecer nomeado, senao vira o item esquecido.
  assert.match(email, /Itens sem origem cadastrada/);

  // E a lista precisa REALMENTE chegar ao e-mail.
  assert.match(orquestracao, /compras: automacao\.compras/);
});
