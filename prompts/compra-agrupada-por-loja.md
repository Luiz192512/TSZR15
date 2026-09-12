# Preparo de compra na origem, agrupado por loja

## Leia isto antes de qualquer coisa

Este prompt nasceu de um pedido que dizia o contrário do que está escrito aqui. O pedido
original era: quando o cliente pagar, o sistema compra sozinho na Shopee ou no AliExpress
usando a conta bancária do dono.

**Isso não vai ser feito, e a decisão é do dono da loja.** Nenhuma das duas plataformas
tem API pública de compra para terceiros, então automatizar o clique significaria dirigir
um navegador logado com o cartão salvo: violação dos termos de uso das duas, risco de
banimento da conta que sustenta o negócio, e credencial de pagamento guardada no sistema.

O que este trabalho entrega é o resto — que é quase tudo:

| O dono pediu | O que será feito |
| --- | --- |
| Cadastrar o item com o link do fornecedor, invisível ao cliente | Sim, integralmente |
| Agrupar itens de lojas diferentes numa compra por loja | Sim, integralmente |
| Confirmar a compra ao cliente | Sim, quando o fornecedor confirma |
| Atualizar status e rastreio | Sim, e fechando um vazamento que existe hoje |
| Clicar "comprar" no fornecedor sozinho | **Não.** O sistema deixa tudo pronto; uma pessoa clica |

Quatro decisões travadas, que não devem ser reabertas durante a execução:

1. **Nenhuma automação de navegador.** Nada de puppeteer, playwright, selenium ou
   webdriver, nem em `devDependencies` para "testar".
2. **Nenhuma credencial de pagamento guardada.** O sistema nunca vê o cartão do dono.
3. **Toda compra passa por uma pessoa** antes de sair dinheiro.
4. **O cliente nunca vê o código de rastreio do fornecedor** — só o status.

Três testes já existentes guardam isso e **não podem ser afrouxados**:
`tests/supplier-automation.test.mjs` — "a automacao nao fala com nenhum fornecedor",
"nenhum condutor de navegador entra no que vai para producao" e "o servidor so fala com o
provedor de pagamento e a busca de CEP". Se um deles ficar vermelho, a mudança está errada,
não o teste.

---

## Estado atual

### O que já existe e funciona

`supplier_purchases` (`supabase/migrations/20260520_customer_accounts.sql:272-294`) já tem
`internal_channel` (CHECK com `shopee`, `aliexpress`, `fornecedor_homologado`, `outro`),
`source_product_url`, `source_store_name`, `source_order_number`, custos, `tracking_code`,
`carrier`, mais `created_by` e `automation_key`
(`20260825120000_payment_ledger_and_webhooks.sql:197-207`).

`runSupplierAutomation` (`src/payments/supplier-automation.js`) roda na confirmação do
pagamento, cria a linha de compra como `nao_comprado`, move o pedido para
`compra_interna_pendente`, grava evento e auditoria, e avisa o operador. Ela **não compra**,
e isso está verificado contra o banco de preview.

`src/admin/order-analytics.js:63-68` e `src/payments/ledger-reconciliation.js:86-90` já
somam **N** compras por pedido. São a prova de que o modelo de várias compras cabe no que
existe — o problema está só nas quatro linhas abaixo.

### As quatro linhas que assumem uma compra por pedido

| Onde | O quê |
| --- | --- |
| `src/payments/supplier-automation.js` (`buildAutomationKey`) | chave `pedido:<orderId>`, única por pedido — a segunda loja seria recusada |
| `src/admin/order-admin.js:273` | `supplierPurchase: supplierPurchases?.[0] ?? null` — o admin veria uma loja só |
| `src/tracking/order-tracking.js:125` | `.limit(1)` — o rastreio mostraria um envio só |
| `20260720130000_stock_reservation_hardening.sql:442-450` | `order by created_at limit 1` — o admin gravaria na compra errada |

E mais uma que quebra em silêncio: `src/payments/supplier-automation.js:150-151` usa
`.eq("automation_key", …).maybeSingle()`, que **erra** assim que existirem duas linhas.

### O que não existe

- Campo de link do fornecedor no **cadastro do produto**. Hoje o link só existe por pedido,
  em `supplier_purchases.source_product_url`, digitado depois pelo operador.
- Qualquer ligação entre `order_items` e `supplier_purchases`.
- Qualquer agrupamento por loja.
- CHECK de banco em `source_status` (a lista válida só existe em
  `src/orders/status.js`, `supplierSourceStatuses`).

### Dois achados de segurança que este trabalho precisa resolver

**1. O lugar óbvio para o link vazaria.** `catalog_products` tem `SELECT` liberado para
`anon`/`authenticated`, e `20260817120000_revoke_catalog_write_grants.sql` diz que isso é
de propósito. A policy `Public can view published catalog products` libera **todas as
colunas** das linhas publicadas, inclusive o jsonb `internal_purchase_source`. Hoje nada
vaza só porque `toPublicCatalogProduct` (`src/catalog/index.js:28-40`) faz strip na
aplicação — mas quem chamar o PostgREST direto com a chave publicável contorna o strip.
**Gravar o link ali entrega o fornecedor a qualquer um que abra o DevTools.**

**2. O código de rastreio já vaza hoje.** `sanitizeSupplierTracking`
(`src/tracking/order-tracking.js:50-64`) devolve `trackingCode`, renderizado em
`src/components/tracking/tracking-lookup.js:95` e `app/conta/page.js:162-163`. A fase 5
não é funcionalidade nova: é correção.

### Divergência a matar, não a dobrar

`run_supplier_automation` (`20260901120000_supplier_automation.sql:20-128`) está aplicada e
**órfã** — o app usa a versão JS, que faz quatro escritas separadas pelo PostgREST. Já são
duas implementações da mesma regra. O agrupamento escreve em três tabelas de uma vez; é a
hora de unificar na função SQL, não de criar a terceira versão.

---

## Fase 1 — o link, onde o cliente não alcança

Criar `catalog_product_supplier_sources` no padrão exato de `catalog_product_costs`
(`20260530134705_admin_pricing_coupons_storage.sql:64,67,69`), cuja proteção tem três
camadas independentes: `enable row level security` **sem nenhuma policy**, `revoke all on
… from anon, authenticated`, e `grant … to service_role`.

Colunas: `product_id` → `catalog_products(id)`, `variation` e `size` (default `''`, que
significa "vale para todas"), `internal_channel` (mesmo CHECK de `supplier_purchases`, para
o valor viajar do produto até a compra sem tradução), `source_store_name`, `store_key`,
`source_product_url`, `source_variation_label`, `unit_cost_cents`, `is_active`,
`internal_notes`. Único por `(product_id, variation, size) where is_active`.

Função `build_supplier_store_key(canal, nome_da_loja)` — `immutable`, `set search_path = ''`
— normalizando para `canal:nome-com-hifens`. **Não usar `unaccent`**: a extensão nunca foi
usada neste projeto e não vale uma dependência nova; usar `translate()` com a tabela de
acentos. A mesma normalização precisa existir em JS, porque agrupamento e chave de
idempotência não podem discordar nunca.

No admin de produtos, campos ao lado de `costCents` (`admin-products-view.js:~178`),
gravados pela RPC `save_admin_catalog_product` na mesma transação do produto — ao lado de
onde `p_cost_cents` já é tratado (`20260814093000_size_aware_stock_rpcs.sql:151-172`).

O link **nunca** entra em `internal_purchase_source`. Esse jsonb continua sendo só metadado
de importação, e `tests/catalog.test.mjs:158` continua exigindo a coluna na projeção
pública — não mexer nisso.

**Portão.** Com a chave publicável (`anon`, não a de serviço):
`GET /rest/v1/catalog_product_supplier_sources` responde `permission denied`, e
`GET /rest/v1/catalog_products?select=*&is_published=eq.true` não traz nenhuma URL de
fornecedor. Rodar também a consulta de auditoria de grants de `docs/ENVIRONMENT.md` com a
tabela nova incluída: resultado vazio.

---

## Fase 2 — agrupar por loja

`supplier_purchases` ganha `store_key` e `confirmed_at`, mais índice único parcial
`(order_id, store_key) where store_key is not null`.

Nova `supplier_purchase_items`: `supplier_purchase_id`, `order_item_id`, `quantity`, e
**snapshot** de `source_product_url`, `source_variation_label`, `unit_cost_cents`. O
snapshot existe pela mesma razão que `order_items.unit_cost_cents` já existe: o produto
pode trocar de fornecedor depois, e o registro tem que mostrar o que foi comprado de fato.

O `unique (order_item_id)` é a invariante que sustenta tudo: cada item pertence a
**exatamente uma** compra. É o que faz o agrupamento ser uma partição de verdade, e o que
impede comprar o mesmo item duas vezes quando o webhook chega repetido.

Chave de idempotência passa a `pedido:<orderId>:loja:<storeKey>`. Produto sem origem
cadastrada cai no grupo `sem_loja` — que é um grupo real, não um descarte: o item precisa
aparecer em algum lugar, senão some do pedido em silêncio. O índice único que já existe
continua servindo; só a chave ficou mais específica.

`runSupplierAutomation` passa a chamar uma RPC transacional única
(`prepare_supplier_purchases`) que faz, num passo só: trava o pedido com `for update`,
mantém a guarda `payment_status = 'pagamento_confirmado'`, lê os itens com left join na
tabela de origens, agrupa, insere as compras com `on conflict do nothing`, insere os itens,
move o status com a guarda de avanço-só, grava **um** evento de rastreio por pedido (não um
por loja — o cliente lê essa tabela, e três eventos iguais denunciariam que o pedido foi
partido) e uma auditoria.

Adicionar também o CHECK de `source_status`, espelhando exatamente `supplierSourceStatuses`
de `src/orders/status.js`. Entra como `not valid` para não travar com linha legada; conferir
no preview com `select distinct source_status` se dá para validar na mesma migração.

**Portão.** Pedido com 3 itens — 2 lojas mais 1 produto sem origem — gera 3 compras com
`automation_key` distinto e uma linha por item em `supplier_purchase_items`. Webhook
reenviado: contagens idênticas, nenhum evento novo, nenhum e-mail novo.

---

## Fase 3 — o admin com N blocos

O bloco "Origem interna e rastreio" (`admin-orders-view.js:359-477`) vira um por loja.
Sai o hidden `supplierPurchaseId` da linha 315; cada campo ganha sufixo de índice
(`sourceStatus__0`, `productCost__1`), mais um `supplierBlockCount`.

**Sufixo indexado, não `formData.getAll()` posicional.** Um campo condicional ou um select
desabilitado desloca o array inteiro em silêncio e grava o custo de uma loja na outra.

Cada bloco mostra o nome da loja, o canal, a badge "criada pela automação" (a lógica das
linhas 364-378 passa a ser por linha) e **a lista dos itens daquela loja, cada um com um
link "Abrir no fornecedor"**. Essa lista é o carrinho pronto — é ela que entrega o requisito
do agrupamento. Compra sem itens ligados (pedido legado) mostra "todos os itens do pedido".

Um bloco vazio extra, "Nova compra na origem", para o operador dividir um pedido à mão.

A RPC `save_admin_order_operation` passa a receber `p_suppliers jsonb` (array), com
`drop function` da assinatura antiga na mesma migração — sem isso o PostgREST cai em
"function is not unique". O fallback `order by created_at limit 1` morre. A guarda que
recusa gravar em compra de outro pedido (`raise exception 'A compra na origem nao pertence
ao pedido selecionado.'`) fica, por bloco.

**Portão.** Salvar dois blocos grava nas duas compras certas; bloco vazio sem id é
descartado; `sourceStatus` inválido é recusado dizendo qual loja falhou.

---

## Fase 4 — avisar o cliente, uma vez só

`notifyCustomerOfConfirmedPurchase({ orderId, supabase })`, disparado por
`saveAdminOrderOperation` depois da RPC — no mesmo ponto onde `recomputeLedger` já roda
fora da transação (`src/admin/order-operation.js:186-196`).

Só avisa quando **todas** as compras do pedido saíram de `nao_comprado`,
`validando_origem` e `problema`. A reserva contra e-mail duplicado é
`update orders set purchase_confirmation_notified_at = now() where id = ? and
purchase_confirmation_notified_at is null` — se afetou zero linhas, outro save já avisou.
Coluna em `orders`, não em `supplier_purchases`: o cliente é avisado uma vez por pedido,
mesmo com três lojas.

Se o envio falhar, limpar a marca e registrar, para o próximo save tentar de novo. Erro de
e-mail nunca derruba a operação do admin — mesma política de
`supplier-automation-email.js`.

O e-mail vai **sem nome de loja, sem número do pedido na origem, sem código de rastreio**.
Depois dele, o pedido avança para `compra_interna_realizada`, que já existe e já é um passo
visível ao cliente.

**Portão.** Confirmar 1 de 3 lojas não manda nada. Confirmar as 3 manda exatamente um.
Salvar de novo não manda um segundo.

---

## Fase 5 — fechar o vazamento do rastreio

Tirar `tracking_code` da **projeção** em `src/tracking/order-tracking.js:122` e
`src/reviews/order-reviews.js:130` — não sanitizar depois. A coluna nem chega à memória do
Worker, então nenhum log, nenhum erro serializado e nenhuma prop de componente pode
derrubá-la por acidente.

Remover o `.limit(1)` da linha 125 e agregar N envios: `carrier` e `sourceEta` só aparecem
quando todas as linhas concordam — transportadoras diferentes revelariam que são dois
fornecedores. Sem consenso, cair no `shipping_eta` do próprio pedido.

Nas telas, o tile "Codigo" (`tracking-lookup.js:93-96`) e o `Código: …`
(`app/conta/page.js:162-163`) viram o rótulo do passo atual, que já vem de
`customerTrackingSteps` e é exatamente o vocabulário pedido: "a caminho", "saiu para
entrega".

Fechar o canal que sobra: `supplier_tracking_events.description` é texto livre do operador
e é renderizado ao cliente. Duas medidas baratas — um aviso no formulário dizendo que
aquele texto aparece para o cliente, e uma recusa em `order-operation.js` quando a
descrição contém o `tracking_code` ou o `source_order_number` de alguma compra do próprio
pedido (a comparação é local, sem custo, e pega o caso real, que é colar).

**Portão.** Preencher um código numa compra, abrir `/rastreio` e `/conta` como cliente e
procurar a string do código no HTML da resposta: zero ocorrências.

---

## Compatibilidade

Backfill de `store_key` nas compras existentes com `build_supplier_store_key`. Quem não tem
`source_store_name` fica `null`, sai do índice único parcial e não colide com nada.

**Nenhum backfill de `supplier_purchase_items`.** A regra é: compra sem itens ligados cobre
o pedido inteiro. Backfillar todos os itens em toda compra legada corromperia justamente os
pedidos que já eram parciais. Deixar essa regra escrita no comentário da migração e num
teste.

Testes que passam a falhar de propósito, para atualizar na mesma mudança:
`tests/admin-order-operation.test.mjs` (forma singular do `supplier`),
`tests/admin-order-operation-migration.test.mjs`, e o teste de não-vazamento em
`tests/supplier-automation.test.mjs` que hoje aponta para o select antigo.

Acrescentar o teste que falta: hoje nada impede que `src/reviews/order-reviews.js` (a rota
`/conta`) troque o select por `select("*")` — o teste de vazamento existente só olha
`src/tracking/order-tracking.js`.

---

## Verificação ponta a ponta, no preview

1. Cadastrar produto **A** com loja "Loja Alfa" (shopee), **B** com "Beta Store"
   (aliexpress), **C** sem origem.
2. **Sonda de segurança com a chave `anon`**, não a de serviço: as duas tabelas novas
   respondem `permission denied`; `catalog_products?select=*` não traz URL de fornecedor.
3. Checkout com A+B+C num pedido só; pagar no sandbox.
4. Conferir 3 compras com chaves distintas, uma linha por item, status
   `compra_interna_pendente`, **um** evento de rastreio, **um** e-mail ao operador com os
   três blocos e o grupo `sem_loja` destacado.
5. Reenviar o mesmo webhook assinado: contagens idênticas, nenhum e-mail novo.
6. Marcar só "Loja Alfa" como `comprado`: nenhum e-mail ao cliente.
7. Marcar as outras duas: exatamente um e-mail, `purchase_confirmation_notified_at`
   preenchido, pedido em `compra_interna_realizada`.
8. Salvar de novo: nenhum segundo e-mail.
9. **Teste de aceite do requisito do rastreio:** preencher um `tracking_code` e procurar a
   string no HTML de `/rastreio` e `/conta` — zero ocorrências.
10. Reembolsar no sandbox: compras intocadas viram `cancelado`, a que tem custo registrado
    fica como `problema` com nota, nenhuma é apagada.

Limpar os dados de teste no fim, como nas fases anteriores.

---

## Fora desta versão

- **Adivinhar a loja pela URL.** Errar junta duas lojas numa compra só — pior do que o
  operador digitar o nome.
- Exportar carrinho em CSV: os links no bloco do admin bastam.
- Câmbio por grupo: as colunas `currency` e `exchange_rate` já existem, ficam manuais.
- Origem por variação/tamanho: as colunas nascem com default `''`, dá para refinar depois
  sem migração nova.
- Qualquer API de transportadora ou polling de rastreio.
- Aviso por WhatsApp: e-mail só, na forma de `src/checkout/order-email.js`.
- Job de vigilância para pedido meio comprado. Na v1, uma badge "2 de 3 confirmadas" no
  admin resolve.

## Riscos conhecidos

- **A descrição do evento de rastreio é o vazamento que sobra.** As duas mitigações da fase
  5 são baratas e devem entrar, mas nenhuma é à prova de operador determinado.
- **Falha parcial de loja.** Uma loja cancela e a regra "só avisa quando todas confirmam"
  mantém o cliente calado por tempo indeterminado. A badge no admin é o mínimo; o
  acompanhamento é humano nesta versão.
- **Formulário grande.** N blocos num `<form>` só: um erro de validação perde a edição
  inteira. Aceitável neste volume; um form por bloco seria N server actions.
