# Ledger financeiro

Como o dinheiro de um pedido é dividido e registrado. Tabela: `public.order_ledger`
(migração `20260825120000_payment_ledger_and_webhooks.sql`).

## A conta

```
margem = liquidado − taxa do gateway − custo do produto − frete ao fornecedor − estornos
```

O valor **cobrado** não é o valor **liquidado**. Exemplo do dono da loja, com
números reais de Pix:

| | |
| --- | --- |
| Cliente pagou | R$ 300,00 |
| Liquidado pelo provedor | R$ 297,03 |
| Taxa do gateway | R$ 2,97 |
| Custo estimado do produto | R$ 125,00 |
| **Margem provisória** | **R$ 172,03** |

Não R$ 175,00. Registrar "pago − custo" faz a contabilidade divergir do extrato
desde o primeiro pedido.

## Duas fases: provisória e reconciliada

O ledger nasce na confirmação do pagamento, com o custo **estimado** que
`order_items.subtotal_cost_cents` congelou no fechamento do pedido. O custo
**real** só existe quando a compra no fornecedor é registrada em
`supplier_purchases`, e pode ser maior:

| | |
| --- | --- |
| Compra real (produto + frete) | R$ 131,40 |
| **Margem reconciliada** | **R$ 165,63** |
| Diferença contra a provisória | −R$ 6,40 |

**Margem negativa é resultado legítimo** e nenhuma coluna de margem tem CHECK de
não-negatividade. Prejuízo precisa aparecer no painel, não ser recusado pelo
banco.

## Decisões registradas

**`settled_amount_cents` é nullable de propósito.** Entre confirmar o pagamento
e o provedor liquidar existe uma janela — em cartão, dias. Nesse intervalo o
ledger existe com liquidação desconhecida, e a margem provisória usa o valor
cobrado menos a taxa estimada. Quem consome o ledger precisa tratar
`settled_amount_cents is null` como "ainda não liquidado", nunca como zero.

**Um ledger por pedido.** `order_id` é UNIQUE — é isso que impede o webhook
reenviado de criar dois ledgers para a mesma venda. A consequência é que
pagamento parcial, ou uma venda dividida em duas cobranças, não cabe no modelo
atual: exigiria trocar a UNIQUE por uma chave composta e somar as parcelas.
Fica registrado como limite conhecido, não como pendência — o negócio hoje é
uma cobrança por pedido, e antecipar o caso genérico custaria complexidade sem
demanda.

## Repasse: o sistema não move dinheiro

O ledger calcula, registra a obrigação e mostra quanto está pendente. A
transferência para a conta da empresa é **ato humano aprovado**, registrado em
`payout_at`, `payout_amount_cents`, `payout_reference` e `payout_approved_by`.

O CHECK `order_ledger_payout_requires_approval` recusa marcar um repasse como
executado sem data, valor e aprovador. A regra está no banco e não só na
aplicação, porque a trilha de auditoria do dinheiro não pode depender de o
código estar correto.

Estorno e chargeback revertem a divisão, **inclusive quando o repasse já foi
marcado como executado** — daí o status `estornado`.

### Split nativo do Mercado Pago

Dividir o valor na própria cobrança entre duas contas exige as duas habilitadas
e autorização do recebedor: passo comercial, não de código. O ledger está
estruturado para acomodar esse modo depois, mas nada no sistema assume que ele
existe, e nenhuma movimentação automática de dinheiro é implementada.

## Reconciliação: recomputar, não somar

`recomputeLedger` ([src/payments/ledger-reconciliation.js](../src/payments/ledger-reconciliation.js))
refaz o ledger inteiro a partir das fontes — pagamento, itens do pedido e
compras no fornecedor. Ele **não** aplica deltas: rodar duas vezes dá o mesmo
resultado, e uma reconciliação perdida se conserta rodando de novo.

É por isso que a chamada fica **fora** da transação do admin
([src/admin/order-operation.js](../src/admin/order-operation.js)): o ledger é
derivado e sempre recomputável, então travar a gravação do operador por causa de
um número recalculável seria pior do que recomputar na próxima operação. Uma
falha ali só registra `ledger_reconciliacao_pos_operacao_falhou` no log.

Duas regras herdadas, repetidas aqui porque são fáceis de quebrar:

- **A taxa não é descontada duas vezes.** `settled_amount_cents` já vem líquido
  do provedor; a taxa só entra quando ele ainda não informou o líquido.
- **Custo real ausente ≠ custo zero.** Zero é um custo possível (brinde, frete
  grátis); só a ausência de linha com valor significa desconhecido, e nesse caso
  `reconciled_margin_cents` fica nulo.

Um ledger `estornado` não é recomputado: recomputar por cima ressuscitaria a
margem de uma venda que não existe mais.

A regra de "quanto o pedido custou" é UMA no projeto — `resolveOrderCostCents`
em [src/admin/order-analytics.js](../src/admin/order-analytics.js), usada pelo
painel de análise e pelo ledger, para que os dois nunca discordem.

## Página financeira

`/admin/financeiro` lista o que está pendente de repasse, com o total acumulado.
Por pedido: recebido, taxa, custo estimado, custo real, margem e status.

**Margem negativa aparece marcada, não escondida** — é o caso que mais importa
antes de transferir qualquer valor.

Dois botões por lançamento:

- **Recalcular** — chama `recomputeLedger` de novo, para quando o custo real foi
  registrado depois.
- **Registrar repasse** — exige valor, data, aprovador e referência. Registra que
  uma **pessoa** transferiu; o sistema não move dinheiro. Desfazer limpa os
  quatro campos, para não sobrar um comprovante órfão.

## Os dois caminhos até "pagamento confirmado"

Existem dois, e ambos passam por `applyConfirmedPaymentEffects`
([src/payments/confirmed-payment.js](../src/payments/confirmed-payment.js)):

1. **o webhook** — Pix, boleto e o cartão que confirma depois;
2. **a própria rota de cobrança do cartão** — a API do provedor responde
   "aprovado" na hora, e a rota já grava o status final.

Sem esse ponto único o cartão aprovado na hora caía num vazio: a rota gravava
`pagamento_confirmado` em `payments`, o webhook seguinte via "status inalterado"
e não fazia nada — o pedido ficava eternamente "aguardando pagamento", sem
ledger e sem compra interna. Descoberto por uma cobrança real no sandbox, não
por leitura de código.

Toda escrita desse ponto é idempotente (UNIQUE em `order_ledger.order_id` e em
`supplier_purchases.automation_key`), então o webhook ainda roda os efeitos
quando encontra "status inalterado" com pagamento confirmado — é o que conserta
uma falha parcial da rota de cobrança.
