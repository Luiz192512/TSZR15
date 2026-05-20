# Planejamento Geral TSZR15

## Modelo de Negocio

O TSZR15 passa a operar como uma loja de compra assistida para pecas e acessorios de Yamaha R15. O cliente escolhe os itens no nosso catalogo, informa os dados de entrega, escolhe a forma de pagamento e envia o pedido para o nosso WhatsApp Business. Depois da confirmacao, a loja executa internamente a compra/fulfillment e acompanha a entrega.

Este modelo nao deve ser tratado como checkout direto de Shopee ou AliExpress dentro do site. O cliente compra conosco; a operacao interna escolhe a melhor origem de compra, registra o custo real, acompanha o pedido e presta suporte ao cliente final. Na experiencia do cliente, o produto e o pedido sao sempre TSZR15: nao deve ser exibido fornecedor, marketplace, vendedor de origem, link de origem ou qualquer indicacao de que o item esta sendo comprado em outro lugar.

Contrato operacional:

- A loja TSZR15 e o ponto de venda, atendimento e pos-venda para o cliente.
- Shopee, AliExpress ou outros parceiros sao canais internos de compra/fulfillment usados pela operacao, visiveis apenas para administracao.
- O cliente precisa aceitar que seus dados de entrega serao usados para cumprir o pedido TSZR15, sem escolher ou visualizar a origem interna da compra.
- O pedido so deve ser tratado como confirmado depois de pagamento validado e disponibilidade conferida.
- A loja deve guardar o snapshot do pedido do cliente e o snapshot da compra/origem interna.
- O sistema nao deve gerar notas fiscais, DANFE, XML ou integrar emissor fiscal/ERP. Qualquer documento externo fica fora do escopo do produto.

## Direcao da Experiencia

A pagina principal deve funcionar como uma vitrine de marketplace inspirada na leitura da OLX: busca grande no topo, categorias horizontais, banner amplo, grade de produtos e acesso claro para entrar na conta. Essa inspiracao e apenas visual e estrutural. A TSZR15 nao deve virar uma plataforma de anuncios de terceiros, nao deve exibir botao de anunciar gratis e nao deve permitir que usuarios publiquem produtos.

O cliente deve conseguir navegar sem login, adicionar produtos ao pedido e finalizar manualmente pelo WhatsApp. Se estiver logado, a conta do cliente deve preencher automaticamente dados de compra e entrega no checkout.

## Prioridade Atual

1. Vitrine R15 com catalogo confiavel.
2. Home estilo marketplace com busca, categorias, banner e cards de produto.
3. Login e cadastro de clientes com Supabase Auth.
4. Dados salvos de cliente, endereco principal e consentimento de compra assistida.
5. Carrinho com resumo de itens, variacoes, frete estimado, forma de pagamento e total.
6. Envio do pedido para WhatsApp Business com mensagem completa.
7. Registro de pedido interno e status operacional.
8. Compra manual ou semiautomatizada por canal interno homologado.
9. Painel admin para acompanhar margem, origem interna, rastreio e problemas.
10. Suporte, devolucao e avaliacao.
11. Experiencia 3D apenas em fase futura, se houver retorno claro.

## Fluxo do Cliente

1. Cliente navega pelo catalogo R15.
2. Usa busca, categorias e cards em uma home estilo marketplace.
3. Escolhe item, variacao e quantidade.
4. Pode entrar/cadastrar conta para salvar dados de compra.
5. Informa ou confirma nome, CPF/CNPJ quando necessario, telefone, WhatsApp, email e endereco de entrega.
6. Aceita termos de privacidade e autoriza uso dos dados para viabilizar a entrega do pedido TSZR15.
7. Escolhe pagamento: Pix, cartao, dinheiro ou combinar no atendimento.
8. Confere resumo com subtotal, frete estimado, prazo estimado e total.
9. Clica em finalizar no WhatsApp Business.
10. Recebe atendimento humano para confirmacao de disponibilidade, prazo e pagamento.
11. Acompanha o pedido pelo status informado pela loja.

## Fluxo Operacional Interno

1. Pedido chega via WhatsApp Business e/ou fica salvo no banco.
2. Atendimento confere se os dados estao completos.
3. Atendimento valida disponibilidade, preco e prazo na origem interna escolhida.
4. Atendimento confirma pagamento do cliente.
5. Operador compra o item no canal interno homologado.
6. Operador usa os dados de entrega autorizados pelo cliente.
7. Sistema registra canal interno, vendedor/origem, link do produto, custo real, frete real, moeda e numero do pedido interno do canal.
8. Operador acompanha postagem e rastreio.
9. Cliente recebe atualizacoes pelo WhatsApp e, futuramente, pelo painel/email.
10. Pedido e encerrado quando entregue, cancelado, reembolsado ou tratado como problema.

## Dados do Cliente

Campos minimos:

- nome completo ou razao social;
- CPF ou CNPJ quando necessario para pagamento ou entrega;
- email;
- telefone e WhatsApp;
- CEP;
- endereco completo;
- complemento e ponto de referencia;
- aceite de termos de uso;
- aceite de politica de privacidade;
- consentimento especifico para usar dados de entrega na operacao interna do pedido.

Dados salvos na conta:

- `customer_profiles`: dados principais do cliente vinculados ao usuario Supabase Auth;
- `customer_addresses`: endereco principal usado para preencher o checkout;
- `assisted_purchase_consents`: historico de aceite com versao do texto, data/hora, IP/user agent quando disponivel e autorizacao de uso dos dados na operacao interna.

Seguranca:

- usar Supabase Auth com sessao em cookies via `@supabase/ssr`;
- usar `proxy.js` do Next.js para atualizar sessao;
- habilitar RLS nas tabelas de cliente;
- permitir que cada cliente leia e altere apenas seus proprios dados usando `auth.uid()`.

Regra de privacidade:

- coletar apenas dados necessarios para atendimento, pagamento e entrega;
- explicar que os dados podem ser usados pela operacao interna para viabilizar a entrega do pedido TSZR15, sem exibir a origem da compra ao cliente;
- registrar data, hora e versao do aceite;
- permitir exportar/remover dados quando aplicavel, preservando registros obrigatorios do negocio.

## Carrinho e Fechamento via WhatsApp Business

Antes de finalizar, o cliente deve ver:

- produtos, variacoes e quantidades;
- preco unitario;
- subtotal;
- desconto;
- frete estimado ou frete a confirmar;
- prazo estimado;
- endereco de entrega;
- forma de pagamento escolhida;
- total final;
- aviso de que a compra e feita com TSZR15 e que o prazo pode depender da operacao de entrega.

Mensagem enviada ao WhatsApp Business:

```text
Ola, quero fechar meu pedido TSZR15.

Itens:
- Slider Esportivo em Aluminio | Variacao: Preto | Qtd: 1 | Unit.: R$ 120,00 | Subtotal: R$ 120,00

Subtotal: R$ 120,00
Frete estimado: A confirmar
Pagamento escolhido: Pix
Total: R$ 120,00

Cliente: Nome do cliente
WhatsApp: (00) 00000-0000
Entrega: Rua, numero, bairro, cidade/UF, CEP
```

## Pedido e Status

Status internos:

- orcamento iniciado;
- enviado ao WhatsApp Business;
- aguardando atendimento;
- dados incompletos;
- aguardando pagamento;
- pagamento confirmado;
- origem interna em validacao;
- compra interna pendente;
- compra interna realizada;
- aguardando postagem/envio;
- rastreio recebido;
- em transito;
- saiu para entrega;
- entregue;
- problema na origem interna;
- problema no envio;
- cancelado;
- reembolsado.

Campos do pedido interno:

- numero interno do pedido;
- cliente;
- endereco snapshot;
- itens comprados pelo cliente;
- total cobrado do cliente;
- forma de pagamento escolhida;
- status do pagamento;
- status operacional;
- operador responsavel;
- canal de atendimento;
- mensagem original enviada pelo cliente;
- consentimento de compra assistida;
- observacoes internas.

Campos da origem de compra interna:

- canal interno de origem: Shopee, AliExpress ou outro;
- link do produto usado internamente;
- identificacao da loja/vendedor de origem, apenas para uso administrativo;
- numero do pedido no canal interno;
- conta operacional usada na compra;
- custo do produto;
- custo de frete da origem interna;
- moeda;
- cotacao usada quando houver compra internacional;
- data da compra;
- prazo informado pela origem interna;
- codigo de rastreio;
- transportadora;
- comprovante/print/arquivo do pedido;
- status da origem interna.

## Suporte, Troca e Devolucao

Como a entrega depende de uma origem de compra interna, o suporte precisa separar claramente:

- problema de pagamento;
- dados de entrega incorretos;
- origem interna nao postou;
- origem interna cancelou;
- rastreio sem atualizacao;
- produto entregue errado;
- produto com defeito;
- arrependimento/devolucao;
- reembolso parcial ou total.

O painel deve guardar historico de atendimento, evidencias, prints, codigos de rastreio, conversas e decisoes de reembolso.

## Roadmap de Implementacao

### Fase 1: Vitrine vendavel com compra assistida

- Manter catalogo R15 curado.
- Criar home principal inspirada na leitura da OLX, sem anuncios de terceiros.
- Criar login, cadastro e conta de cliente com Supabase.
- Salvar perfil, endereco principal e consentimento de compra assistida.
- Manter carrinho e resumo de pedido.
- Coletar dados completos de entrega.
- Adicionar aceite de compra com TSZR15 e uso operacional dos dados de entrega.
- Enviar mensagem completa ao WhatsApp Business.
- Mostrar aviso claro de prazo estimado sem exibir fornecedor/origem do produto.

### Fase 2: Pedido salvo e operacao manual controlada

- Criar banco de dados.
- Criar modelo de cliente, endereco, pedido, item do pedido e origem de compra interna.
- Criar painel admin basico.
- Registrar pagamento confirmado manualmente.
- Registrar canal interno, vendedor/origem, link, custo, frete, numero do pedido e rastreio.
- Criar status operacionais.
- Exportar pedidos em CSV/XLSX.

### Fase 3: Pagamento e frete

- Integrar Mercado Pago para Pix/link/cartao.
- Confirmar pagamento por webhook.
- Consultar CEP por ViaCEP.
- Usar frete estimado interno ou API de frete quando aplicavel.
- Registrar custo real de frete da origem interna.

### Fase 4: Automacao de origem interna

- Avaliar APIs oficiais ou ferramentas homologadas para Shopee e AliExpress.
- Comecar por semi-automacao: abrir link do produto, copiar dados, registrar numero do pedido.
- Automatizar somente onde houver API/termos permitidos.
- Integrar rastreio quando o canal interno disponibilizar.

### Fase 5: Suporte e confianca

- Criar suporte vinculado ao pedido.
- Criar avaliacao de produto apos entrega.
- Criar relatorios financeiros e de margem.
- Criar alertas de atraso/problema.

### Fase 6: Experiencia avancada opcional

- Criar configurador 3D apenas se houver retorno claro.
- Medir impacto em conversao antes de expandir.

## Catalogo R15

Categorias de vitrine:

- `Suporte & Sliders`
- `Estetica`
- `Escapamentos`
- `Adesivagem`
- `Manutencao`

Regra de catalogo:

- publicar apenas itens compatíveis com Yamaha R15;
- permitir excecoes de referencia visual somente quando aprovadas, como `Frente R6` e `Hayabusa Adesivos Japones`;
- bloquear `Vestuário`, R3, SBM 250s e outros modelos fora do escopo;
- permitir que um SKU apareca em varias categorias sem duplicar estoque/preco/midia;
- cada SKU deve ter `storefrontCategoryIds[]`, `productFamily`, `bikeModelScope`, `priceCents`, `variations[]`, `availability`, `checkoutChannel`, `internalPurchaseSource` e campos futuros para `internalPurchaseCandidates[]`.

## Aceitacao do Replanejamento

- O cliente deve saber que esta comprando com a TSZR15, sem visualizar fornecedor, marketplace, vendedor de origem ou link usado internamente.
- O sistema deve coletar aceite especifico antes de usar dados do cliente na operacao interna de entrega.
- O pedido deve guardar tanto o total cobrado do cliente quanto o custo real pago na origem interna.
- O admin deve conseguir identificar origem interna, canal de compra, numero de pedido, rastreio e margem por pedido, sem expor isso ao cliente.
- A loja deve manter responsabilidade de atendimento com o cliente final.
- O sistema nao deve gerar notas fiscais, DANFE, XML nem depender de emissor fiscal/ERP.
