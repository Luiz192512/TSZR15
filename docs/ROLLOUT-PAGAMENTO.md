# Rollout do pagamento online

Procedimento para ligar Pix, cartão e boleto na loja no ar — e para desligar
quando algo der errado.

A ordem existe porque **o banco vem antes do código, sempre**. O projeto já teve
três incidentes por migração não aplicada; o deploy chega em segundos e uma
tabela que falta derruba o checkout inteiro.

---

## 0. Estado atual

| | Produção | Staging |
| --- | --- | --- |
| Worker | `tsz-store` | `tsz-store-preview` |
| URL | https://tsz-store.enz-luizgustavo.workers.dev | https://tsz-store-preview.enz-luizgustavo.workers.dev |
| Supabase | `mckthvbwddxipghumrpw` | `ywrpvhciugoomzejwdik` |
| Credencial Mercado Pago | conta real | usuário de teste (sandbox) |
| Chave de habilitação | `PAYMENTS_ONLINE_ENABLED` | `PAYMENTS_PREVIEW_ONLINE_ENABLED` |
| Migrações de pagamento | **não aplicadas** | aplicadas |

A chave de habilitação tem **nome diferente por ambiente e não tem fallback**:
ligar o staging não liga a loja no ar, e a variável exportada por engano no
terminal errado não atravessa. Ausente ou diferente de `true` mantém a loja
exatamente como está hoje — só o fluxo de WhatsApp Business.

`npm run pagamento:verificar` confere a credencial do ambiente atual e diz se a
conta é de teste ou real. Rode antes e depois de cada passo desta página.

---

## 1. Migrações: preview primeiro, produção depois

Duas migrações precisam existir em produção antes de qualquer deploy que ligue
o pagamento:

| Arquivo | O que cria |
| --- | --- |
| `supabase/migrations/20260825120000_payment_ledger_and_webhooks.sql` | colunas de liquidação em `payments`, tabelas `payment_webhook_events` e `order_ledger`, `created_by`/`automation_key` em `supplier_purchases` |
| `supabase/migrations/20260901120000_supplier_automation.sql` | apoio da automação de compra interna |

As duas são **aditivas**: nenhuma coluna some, nenhum pedido existente muda, e
`anon`/`authenticated` não recebem grant nenhum sobre taxa, custo ou margem.

Aplicar, nesta ordem:

1. Confirmar que já estão no preview e exercitadas (elas estão — foi onde as
   fases 4 a 7 rodaram).
2. Aplicar em produção pelo SQL Editor do Supabase, uma de cada vez, conferindo
   o retorno de cada uma antes da seguinte.
3. Conferir que as tabelas existem em produção antes de seguir.

**Só depois disso** faça o deploy do código.

---

## 2. Deploy com o pagamento desligado

```bash
npm run deploy
```

Produção sobe sem `PAYMENTS_ONLINE_ENABLED`, portanto **desligada**: o checkout
continua terminando no WhatsApp, a tela de pagamento responde 404 e o boleto
nem aparece no seletor de forma de pagamento. Esse é o estado seguro, e é onde
a loja deve ficar até o passo 4 passar.

Confirme que nada mudou para o cliente antes de continuar.

---

## 3. Webhook no painel do Mercado Pago

O painel tem **um** webhook, não um por aplicação — por isso o segredo de
assinatura (`MERCADOPAGO_WEBHOOK_SECRET`) é o mesmo nos dois ambientes.

- **Para testar em staging**, aponte para
  `https://tsz-store-preview.enz-luizgustavo.workers.dev/api/pagamento/webhook`
- **Para produção**, aponte para
  `https://tsz-store.enz-luizgustavo.workers.dev/api/pagamento/webhook`

Evento: `payment` (no painel, "Pagamentos"). A rota ignora e responde 200 a
qualquer outro tipo — sem isso o provedor reenviaria para sempre um evento que
o handler não entende.

Se o segredo for rotacionado no painel, ele precisa ser reenviado aos **dois**
Workers, ou o ambiente esquecido passa a recusar todo evento com 401.

---

## 4. Teste de ponta a ponta em staging

Com `PAYMENTS_PREVIEW_ONLINE_ENABLED=true` no Worker de staging:

1. **Catálogo e carrinho** — adicionar produto, preencher entrega, escolher Pix.
   O checkout deve redirecionar para `/pedido/pagamento/<id>`, não para o
   WhatsApp. Escolhendo "Combinar no atendimento" ele **deve** ir ao WhatsApp.
2. **Pix** — gerar o código. Confira QR, copia-e-cola e a contagem até expirar.
3. **Cartão** — cartão de teste `5031 4332 1540 6351`, CVV `123`, validade
   `11/2030`, nome `APRO`, CPF `12345678909`. A tela deve virar para a
   confirmação sozinha.
4. **Boleto** — nome, sobrenome, e-mail e CPF. Deve sair linha digitável e
   vencimento. O emissor **recusa boleto sem endereço do pagador**; o endereço
   vem do pedido, então um pedido sem CEP não gera boleto.
5. **No banco de preview**, conferir para o pedido pago:
   - `orders.payment_status = 'pagamento_confirmado'`
   - `orders.operational_status = 'compra_interna_pendente'`
   - uma linha em `order_ledger` com margem provisória
   - uma linha em `supplier_purchases` com `created_by = 'automacao'`
6. **Reentrega do webhook** — mandar o mesmo evento duas vezes. A segunda não
   pode duplicar compra nem ledger.
7. **Financeiro** — `/admin/financeiro` deve listar o pedido como pendente de
   repasse, com a margem certa.

Falhou qualquer passo: **não prossiga**. Corrija em staging.

---

## 5. Ligar em produção

```bash
npx wrangler secret put PAYMENTS_ONLINE_ENABLED
# digite: true
```

Não precisa de deploy: a chave é lida em tempo de execução.

Faça **uma compra real de valor baixo**, com cartão próprio, e confira os mesmos
sete itens do passo 4 no banco de produção. Estorne em seguida pelo painel do
provedor e confirme que o webhook de estorno desfez a compra interna e marcou o
ledger como `estornado`.

Só depois divulgue.

---

## 6. Rollback

**Desligar é uma variável, não um deploy.**

```bash
npx wrangler secret put PAYMENTS_ONLINE_ENABLED
# digite: false
```

Efeito imediato:

- as rotas de cobrança e a de status respondem **404**
- a tela de pagamento responde **404** com um aviso e link de volta ao carrinho
- o checkout volta a terminar no WhatsApp
- o webhook responde 404 e o provedor passa a reenviar

Para **monitorar** que o desligamento pegou, tanto `/pedido/pagamento/<id>`
quanto `/api/pagamento/status?orderId=…` devolvem **404**.

O 404 da página vem do guard em `middleware.js`, não do `notFound()` da própria
página: nesta versão do Next, `notFound()` chamado de dentro de uma página
responde HTTP **200** com o corpo de 404, porque o cabeçalho já foi enviado
quando o componente decide. O middleware decide antes do primeiro byte.

O mesmo problema continua valendo para `/produto/<slug>` inexistente, que
responde 200 com corpo de 404 — soft 404 para buscador. Não dá para resolver no
middleware (ele não sabe quais slugs existem) e `dynamicParams = false` faria
produto novo sumir até o próximo build. Fica registrado como limitação conhecida.

**Pedidos já cobrados continuam válidos.** O que quebra é a confirmação
automática: com o webhook devolvendo 404, um pagamento que compensar durante o
desligamento não vai atualizar o pedido sozinho. Reative a chave e reenvie os
eventos pelo painel do provedor, ou use o botão **Recalcular** em
`/admin/financeiro` depois de acertar o status do pedido no painel.

Rollback de código é `npx wrangler rollback` no Worker. **Não desfaça as
migrações**: elas são aditivas, o código antigo ignora as colunas novas, e um
`drop` levaria junto o ledger de pedidos já pagos.

---

## 7. O que observar depois de ligar

Todos os eventos saem em JSON pelo logger, visíveis em
`npx wrangler tail --config wrangler.jsonc` e no painel de observabilidade do
Worker.

Por gravidade:

| Evento | Significa | O que fazer |
| --- | --- | --- |
| `payment_charge_orfa` | o provedor aceitou a cobrança e a gravação aqui falhou | **urgente**: achar o pagamento no painel pelo `providerPaymentId` e conciliar à mão |
| `payment_efeitos_falharam` | pagamento gravado, mas ledger/compra interna não | o webhook reaplica sozinho; se não chegar, use **Recalcular** no financeiro |
| `automacao_fornecedor_pedido_nao_encontrado` | dinheiro recebido sem pedido para preparar | investigar antes de entregar |
| `automacao_fornecedor_falhou` | a compra interna não foi criada | criar manualmente no painel |
| `ledger_reconciliacao_pos_operacao_falhou` | o ledger não recomputou depois da operação | benigno: **Recalcular** conserta |
| `payment_webhook_signature_rejected` | assinatura inválida | segredo dessincronizado entre painel e Worker, ou tentativa de forjar evento |
| `payment_boleto_nao_emitido` | o emissor recusou | quase sempre endereço ou CPF do pagador |
| `payment_provider_failed` | provedor fora do ar ou recusando | se `retryable`, é indisponibilidade; se não, é dado inválido |

O primeiro da lista é o único que perde dinheiro em silêncio. Vale um alerta
próprio se o volume crescer.

---

## 8. O que este rollout NÃO faz

**O sistema não transfere dinheiro.** Ele calcula a margem, registra a
obrigação em `order_ledger` e espera uma pessoa confirmar a transferência em
`/admin/financeiro`. Não há API de transferência em lugar nenhum do código, e
existe teste que falha se alguém adicionar uma.

**A automação não compra no fornecedor.** Ela cria a linha de compra, move o
status e avisa o operador. Comprar em Shopee ou AliExpress continua sendo ato
humano — decisão do dono da loja, com teste que impede a "conclusão" silenciosa
dessa automação.

---

## 9. Pendências de segurança conhecidas

### `REVALIDATE_SECRET` exposto no histórico de migrações

A migração `20260708155149_repoint_revalidate_webhooks_to_cloudflare_worker`
foi aplicada direto no painel em 2026-07-08 e grava o `REVALIDATE_SECRET`
**literal** dentro do corpo dos gatilhos. Ele está em texto puro em
`supabase_migrations.schema_migrations`, legível por qualquer um com acesso ao
projeto — e vai junto em backup e export.

O que esse segredo permite a quem o tiver: chamar `/api/revalidate` no Worker e
forçar invalidação de cache. Não lê nem escreve dado de cliente, mas dá um
vetor de carga sobre a loja.

Rotação:

1. gerar um segredo novo;
2. `npx wrangler secret put REVALIDATE_SECRET` no Worker de produção;
3. reaplicar a migração trocando `__REVALIDATE_SECRET__` pelo novo valor;
4. conferir que publicar um produto no admin ainda invalida o cache.

O arquivo no repositório usa marcador justamente para o segredo não entrar no
Git na hora de fechar essa pendência.

### Staging não revalida cache

O projeto de preview não tem os gatilhos `catalog_revalidate` nem
`stock_revalidate`. Publicar produto em staging não invalida cache nenhum, então
a vitrine de lá pode mostrar catálogo velho por até uma hora (o `revalidate` das
páginas). Para igualar, aplique a mesma migração no preview apontando para o
Worker de staging e com um `REVALIDATE_SECRET` **próprio** — o mesmo segredo nos
dois deixaria o staging capaz de invalidar o cache da loja no ar.

### O link de pagamento não é preso ao cliente

`/pedido/pagamento/<id>` tem como única credencial o próprio id do pedido — um
UUID v4, que não é adivinhável nem enumerável. Quem tiver o link vê **número do
pedido, valor e status**, e nada mais: nome, endereço, e-mail, CPF, taxa, custo
e margem não saem de lá. Não existe caminho para tirar valor: pagar o pedido de
outra pessoa é dar dinheiro a ela.

O que já protege: `Referrer-Policy: strict-origin-when-cross-origin` (a URL
inteira nunca vaza para site externo), `robots.txt` bloqueando `/pedido`,
`noindex` na própria página, e **validade de 7 dias**
(`PAYMENT_LINK_TTL_DAYS`) — pedido pago não vence, para o cliente poder voltar
e ver a confirmação. O prazo não impede um vazamento; ele fecha a janela.

O que ainda não existe, em ordem de valor:

1. amarrar o pedido à conta quando o cliente está logado;
2. segundo fator para convidado (4 últimos dígitos do WhatsApp, ou o CEP).

`/api/pagamento/status` **não** checa a validade do link: ela custaria uma
consulta a mais numa rota que é chamada em laço, e o que ela devolve é o mesmo
status que a página já mostrava. A guarda que importa está em
`loadChargeableOrder` — é lá que o dinheiro se move, e ela recusa com 410 mesmo
que alguém chame a rota de cobrança direto, sem passar pela tela.

### Soft 404 em `/produto/<slug>`

Produto inexistente responde HTTP 200 com corpo de 404, porque `notFound()`
dentro de uma página não muda o status nesta versão do Next. Buscador indexa
como página válida. O guard de middleware que resolve isso para a tela de
pagamento não serve aqui: o middleware não sabe quais slugs existem, e
`dynamicParams = false` faria produto novo sumir da loja até o build seguinte.
