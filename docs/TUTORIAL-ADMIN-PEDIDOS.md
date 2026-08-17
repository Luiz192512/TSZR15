# Tutorial do admin — aba Pedidos

Guia de operação da aba **Pedidos** do painel `/admin`: o que cada campo significa, o que
escrever em cada um, o que o cliente enxerga e o que acontece no banco quando você salva.

Referências de código: `app/admin/page.js` (tela), `app/admin/actions.js` (ações do formulário),
`src/admin/order-admin.js` e `src/admin/order-operation.js` (regras), `src/orders/status.js`
(listas de status).

Para a aba Produtos, veja [TUTORIAL-ADMIN-PRODUTOS.md](./TUTORIAL-ADMIN-PRODUTOS.md).

---

## 1. Entrar no painel

1. Acesse `/admin`. Sem sessão válida você é redirecionado para `/entrar?next=/admin`.
2. Informe o token administrativo (`TSZR15_ADMIN_TOKEN` do ambiente do servidor).
3. Se aparecer a tela "Ative o painel administrativo", faltam variáveis no servidor
   (`TSZR15_ADMIN_TOKEN`, URL do Supabase e chave privilegiada). Se aparecer "Aplique a migration
   do Supabase", as tabelas ainda não existem no projeto conectado.
4. O botão **Sair** fica no canto superior direito e encerra a sessão.

As abas do painel são **Pedidos**, **Produtos**, **Análise** e **Cupons**. Este tutorial cobre
Pedidos (e a parte de Análise que depende dos dados de pedido).

---

## 2. Como a tela de Pedidos é organizada

- **Coluna da esquerda — Fila:** os **30 pedidos mais recentes**, do mais novo para o mais antigo.
  Cada linha mostra número do pedido, nome do cliente, selo de status interno, valor total e o
  status operacional. Clique para abrir o pedido à direita.
- **Coluna da direita — Detalhe do pedido:** cabeçalho com número, contato e total; grade de
  status; itens; dados do cliente; o formulário de operação; o histórico de eventos; e, no fim,
  os botões de decisão final.
- **Botão "Adicionar pedido"** (topo direito): abre o formulário de pedido manual.

### Selos de status interno

| Selo | Significado |
| --- | --- |
| ✓ Confirmado | Você confirmou o pedido para a operação interna |
| ! Pendente | Sem decisão há **24 horas ou mais** — o sistema marca sozinho |
| X Recusado | Você recusou o pedido; o histórico é mantido |
| (sem selo) | Pedido novo, com menos de 24h e ainda sem decisão |

---

## 3. Fluxo recomendado do dia a dia

1. Abra a fila e ataque primeiro quem tem selo **! Pendente**.
2. Abra o pedido, confira itens, contato e endereço.
3. Atualize **Status do pedido** (pagamento + operacional + operador).
4. Quando comprar na origem, preencha o bloco **Origem interna e rastreio**.
5. A cada novidade do rastreio, registre um **Novo evento de rastreio** — é o que o cliente vê.
6. Clique em **Salvar operação**.
7. Use **Confirmar** ou **Recusar pedido interno** para fechar a decisão.

---

## 4. Criar um pedido manual ("Adicionar pedido")

Use quando a venda chegou por fora do site (WhatsApp, presencial, indicação).
Só aparecem produtos **publicados** no catálogo; se a lista estiver vazia, publique um produto
antes na aba Produtos.

### Bloco Cliente

| Campo | Obrigatório | O que colocar |
| --- | --- | --- |
| Nome | Sim | Nome completo do cliente |
| WhatsApp | Não* | Número com DDD, ex.: `(11) 99999-9999` |
| Telefone alternativo | Não | Segundo contato, se houver |
| Email | Não* | E-mail válido (usado em comunicação e ranking de clientes) |
| CPF/CNPJ | Não | Documento para emissão/conferência |
| CEP | Sim | CEP de entrega |
| Endereço de entrega | Sim | Rua, número, complemento, bairro, cidade/UF |
| Observações do cliente | Não | O que o cliente pediu (cor, prazo, referência de entrega) |

\* Não são obrigatórios pelo formulário, mas **preencha WhatsApp ou e-mail**: é por esse contato
que o cliente consulta o pedido na página pública de rastreio, e é a chave usada no ranking de
"usuários que mais compraram".

### Bloco Produto e pagamento

| Campo | O que colocar |
| --- | --- |
| Produto | Obrigatório. Lista mostra nome + preço de venda |
| Variação | Deixe vazio para usar a primeira variação do produto; ou digite exatamente a variação cadastrada |
| Quantidade | Número inteiro ≥ 1 (padrão `1`) |
| Pagamento | Método combinado (padrão `pix`) |
| Entrega | Modalidade (padrão `combinar`) |
| Observações internas | Texto só para a equipe — nunca aparece para o cliente |

Ao clicar em **Criar pedido**, o sistema gera o número do pedido, grava itens e pagamento,
**reserva o estoque das variações** e registra `admin_manual_order_created` no log de auditoria.
Você é levado direto ao pedido criado com a mensagem "Pedido criado no painel admin".

Se o estoque da variação for insuficiente, a criação falha com mensagem de erro no topo da tela —
ajuste o estoque na aba Produtos ou escolha outra variação.

---

## 5. Formulário de operação (o coração da aba)

Tudo abaixo é salvo de uma vez só no botão **Salvar operação**, dentro de uma única transação.

### 5.1 Bloco "Status do pedido"

| Campo | O que colocar |
| --- | --- |
| Status de pagamento | Situação financeira real do pedido (tabela na seção 7) |
| Status operacional | Etapa logística atual — é o que aparece na fila e para o cliente |
| Operador | Quem está tocando o pedido (ex.: `Luiz`). Deixe vazio se ninguém assumiu |
| Provedor pagamento | Onde o dinheiro entrou: `manual`, `pix`, `mercadopago`, `infinitepay`… (padrão `manual`) |
| Referência do pagamento | Identificador da transação: end-to-end do Pix, ID da cobrança, "comprovante enviado no WhatsApp" |
| Observações internas do pedido | Contexto interno: combinados, riscos, promessas feitas ao cliente |

Regras importantes:

- Marcar **Pagamento confirmado** grava a data de pagamento (`paid_at`) automaticamente na
  primeira vez. Voltar para outro status limpa essa data.
- Mudar o status operacional para **Cancelado** **devolve o estoque** reservado. Tirar de
  Cancelado **re-reserva** o estoque.
- Só pedidos com pagamento confirmado, não cancelados e não recusados entram como venda nas
  métricas da aba Análise.

### 5.2 Bloco "Origem interna e rastreio"

Preencha conforme for comprando/despachando. Se todos os campos ficarem vazios (e o status da
origem continuar `Nao comprado`), nenhum registro de compra é criado — não tem problema salvar
sem preencher.

| Campo | O que colocar | Formato |
| --- | --- | --- |
| Canal interno | Onde a compra foi feita: Shopee, AliExpress, Fornecedor homologado, Outro | seleção |
| Status da origem | Andamento na origem (tabela na seção 7) | seleção |
| Loja/vendedor origem | Nome da loja/vendedor na plataforma | texto |
| Pedido na origem | Número do pedido no fornecedor | texto |
| Link interno do produto | URL do anúncio comprado | URL |
| Conta operacional | Conta/e-mail usado na compra | texto |
| Comprado em | Data e hora da compra | `datetime-local`, **horário de Brasília** |
| Custo produto | Quanto você pagou pelo item | `120,00` / `120.00` / `2.490,00` — aceita `0` |
| Custo frete | Frete pago na origem | mesmo formato de dinheiro |
| Moeda | Moeda da compra (padrão `BRL`) | `BRL`, `USD`, `CNY`… |
| Cotação | Câmbio usado quando a moeda não for BRL, ex.: `5.45` | número ≥ 0 |
| Prazo origem | Prazo prometido pelo fornecedor, ex.: `15 a 25 dias` | texto |
| Transportadora | Correios, Jadlog, Shopee Xpress… | texto |
| Código de rastreio | Código para o cliente acompanhar | texto |
| Comprovante | Link do comprovante/nota | URL |
| Notas da origem | Observações internas da compra | texto longo |

Dinheiro: pode usar vírgula ou ponto como decimal e ponto/vírgula como separador de milhar
(`199,90`, `199.90`, `2.490,00`). Valor inválido bloqueia o salvamento com a mensagem
"Informe um custo de produto valido." (ou de frete).

Datas: o campo usa o fuso **America/Sao_Paulo**. Data inválida gera
"Informe uma data da compra valida no horario de Brasilia.".

Custos alimentam o **lucro estimado** por item e da loja — preencher custo de produto e frete é o
que torna a aba Análise confiável.

### 5.3 Bloco "Novo evento de rastreio"

Esse bloco **cria um novo evento a cada salvamento** — ele sempre começa vazio. Deixe em branco
quando não houver novidade; preencha só quando quiser registrar mais uma linha na linha do tempo.

| Campo | O que colocar |
| --- | --- |
| Status do evento | Um id de status operacional, ex.: `em_transito`, `saiu_para_entrega`, `entregue`. Se ficar vazio, o sistema usa o status operacional atual do pedido |
| Data do evento | Quando aconteceu (horário de Brasília). Vazio = agora |
| Local | Cidade/UF ou unidade, ex.: `Curitiba/PR` |
| Descrição pública | **O cliente lê este texto.** Escreva claro e sem dado interno: "Objeto em trânsito para a unidade de distribuição" |

Basta preencher **um** dos quatro campos para o evento ser criado.

### 5.4 O que acontece ao clicar em "Salvar operação"

Em uma transação só: atualiza o pedido, atualiza o pagamento, ajusta estoque se o status virou (ou
deixou de ser) cancelado, cria/atualiza a compra na origem, insere o evento de rastreio e grava
`admin_order_updated` na auditoria. Sucesso mostra "Pedido atualizado.".

Cada carregamento da página gera um identificador de operação único, o que torna o salvamento
**idempotente**: se você reenviar o mesmo formulário (botão voltar do navegador, duplo clique), o
sistema devolve o resultado da primeira gravação em vez de duplicar eventos. Para fazer uma
alteração nova, **recarregue a página do pedido** antes de salvar de novo.

---

## 6. Decisão final: confirmar ou recusar

No fim do detalhe do pedido:

- **Confirmar pedido interno** — libera o pedido para a operação interna e marca o selo ✓.
  Se estava recusado, o estoque é **re-reservado**.
- **Recusar pedido interno** — marca X, mantém todo o histórico e **devolve o estoque** ao catálogo.

Ambos gravam `admin_internal_order_status_updated` na auditoria com data/hora. A decisão pode ser
trocada depois; o estoque acompanha a mudança automaticamente.

Pedidos sem decisão viram **Pendente** sozinhos após 24 horas — o selo é só um lembrete de que
alguém precisa decidir.

---

## 7. Tabelas de referência

### Status de pagamento

| Id | Rótulo | Quando usar |
| --- | --- | --- |
| `aguardando_pagamento` | Aguardando pagamento | Cobrança enviada, dinheiro não caiu |
| `pagamento_confirmado` | Pagamento confirmado | Valor recebido e conferido |
| `cancelado` | Cancelado | Venda desfeita antes do pagamento |
| `reembolsado` | Reembolsado | Dinheiro devolvido ao cliente |

### Status operacional

| Id | Rótulo |
| --- | --- |
| `orcamento_iniciado` | Orcamento iniciado |
| `enviado_whatsapp_business` | Enviado ao WhatsApp |
| `aguardando_atendimento` | Aguardando atendimento |
| `dados_incompletos` | Dados incompletos |
| `aguardando_pagamento` | Aguardando pagamento |
| `pagamento_confirmado` | Pagamento confirmado |
| `origem_interna_em_validacao` | Origem em validacao |
| `compra_interna_pendente` | Compra interna pendente |
| `compra_interna_realizada` | Compra interna realizada |
| `aguardando_postagem_envio` | Aguardando postagem |
| `rastreio_recebido` | Rastreio recebido |
| `em_transito` | Em transito |
| `saiu_para_entrega` | Saiu para entrega |
| `entregue` | Entregue |
| `problema_origem_interna` | Problema na origem |
| `problema_envio` | Problema no envio |
| `cancelado` | Cancelado |
| `reembolsado` | Reembolsado |

### Status da origem

`nao_comprado`, `validando_origem`, `comprado`, `postado`, `em_transito`, `entregue`, `problema`,
`cancelado`.

---

## 8. O que o cliente vê e o que é interno

O cliente consulta o pedido em `/rastreio` informando número do pedido + contato. Ele vê:

- número do pedido, data, nome, itens (produto, variação, quantidade) e total;
- status de pagamento e status operacional;
- transportadora, prazo da origem e código de rastreio;
- todos os eventos de rastreio: status, data, local e **descrição pública**.

Fica **somente interno**: custo de produto, custo de frete, moeda/cotação, loja e pedido na
origem, link do anúncio, conta operacional, comprovante, notas da origem, observações internas do
pedido e o nome do operador.

Regra prática: se estiver com dúvida se um texto pode vazar, escreva em "Notas da origem" ou
"Observações internas", nunca em "Descrição pública".

---

## 9. Reflexo na aba Análise

Os números da aba Análise saem direto dos pedidos:

- **Quantidade de vendas / Receita / Ticket médio**: só pedidos com pagamento confirmado, não
  cancelados e não recusados.
- **Lucro estimado**: receita menos custos conhecidos — custo de produto + frete da compra na
  origem; na falta deles, o custo cadastrado nos itens.
- **Status interno**: contagem de confirmados, pendentes, recusados e novos sem decisão.
- **Usuários que mais compraram**: agrupado por WhatsApp, e-mail ou nome (nessa ordem).
- **Itens mais vendidos / mais bem avaliados** e a fila de **avaliações pendentes** para aprovar
  ou recusar.

Conclusão prática: manter status de pagamento e custos em dia é o que faz as métricas baterem.

---

## 10. Mensagens de erro comuns

| Mensagem | Causa | Correção |
| --- | --- | --- |
| Sessao administrativa expirada. | Cookie de admin venceu | Entre de novo em `/entrar?next=/admin` |
| Requisicao administrativa rejeitada. | Envio de outra origem | Envie o formulário pela própria página `/admin` |
| Selecione um produto publicado para criar o pedido. | Produto não escolhido ou despublicado | Publique o produto na aba Produtos |
| Informe um custo de produto valido. / …um custo de frete valido. | Valor monetário malformado | Use `120,00` ou `120.00` |
| Informe uma data da compra valida no horario de Brasilia. | Data incompleta/inválida | Preencha data e hora no campo |
| Status de pagamento/operacional/da origem invalido. | Valor fora das listas oficiais | Recarregue a página e use o seletor |
| O numero do pedido nao corresponde ao pedido selecionado. | Formulário de outro pedido | Recarregue o pedido correto |
| Pagamento do pedido nao encontrado. | Pedido sem registro de pagamento | Verifique o pedido no banco antes de reprocessar |
| Configure a URL do Supabase e uma chave privilegiada do Supabase. | Ambiente incompleto | Ajuste as variáveis do servidor |

---

## 11. Checklists rápidos

**Pedido novo que chegou pelo site**
1. Abrir na fila → conferir itens, contato e endereço.
2. Pagamento: `aguardando_pagamento` → `pagamento_confirmado` quando cair.
3. Preencher Operador e Referência do pagamento.
4. Salvar operação → **Confirmar pedido interno**.

**Comprei na origem**
1. Canal interno + Status da origem `comprado`.
2. Loja, pedido na origem, link, conta operacional, comprado em.
3. Custo produto e custo frete (moeda/cotação se for compra internacional).
4. Status operacional `compra_interna_realizada`.
5. Salvar operação.

**Chegou o rastreio**
1. Transportadora + código de rastreio.
2. Status operacional `rastreio_recebido` (ou `em_transito`).
3. Evento de rastreio com descrição pública amigável.
4. Salvar operação.

**Cliente desistiu**
1. Status operacional `cancelado` (e pagamento `cancelado` ou `reembolsado`).
2. Observações internas com o motivo.
3. Salvar operação — o estoque volta sozinho.
4. Se o pedido nunca deveria ter entrado na operação, use **Recusar pedido interno**.
