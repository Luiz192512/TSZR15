# APIs necessarias para o TSZR15 com compra assistida

## Modelo operacional

O cliente compra na TSZR15. A loja coleta dados, confirma pagamento e usa esses dados, com consentimento, para comprar o item em fornecedor externo como Shopee, AliExpress ou fornecedor homologado. No MVP, essa compra no fornecedor pode ser manual. A automacao de Shopee/AliExpress deve ser feita apenas com API oficial, ferramenta homologada ou fluxo permitido pelos termos do provedor.

## Necessario agora

### WhatsApp Business simples

Uso atual: abrir o WhatsApp com mensagem pronta usando `https://wa.me/<numero>?text=<mensagem>`.

Pegar:

- numero do WhatsApp Business da loja com DDI e DDD, apenas numeros.

Onde colocar:

```bash
NEXT_PUBLIC_WHATSAPP_BUSINESS_NUMBER=5511999999999
WHATSAPP_BUSINESS_NUMBER=5511999999999
NEXT_PUBLIC_STORE_NAME=TSZR15
```

### Consentimento de compra assistida

Nao depende de API externa, mas precisa entrar no produto antes de escalar.

Guardar no banco:

- aceite de termos de uso;
- aceite de politica de privacidade;
- texto aceito pelo cliente;
- data/hora do aceite;
- IP/user agent quando disponivel;
- permissao para usar nome, telefone e endereco no fornecedor externo escolhido.

## Banco de dados

Uso: salvar cliente, endereco, pedido, itens, pagamento, fornecedor, compra no marketplace, rastreio, margem e historico de atendimento.

Melhor custo-beneficio:

- Supabase se quiser banco + auth + storage + painel auxiliar no mesmo pacote.
- Neon se quiser apenas Postgres barato e simples.

Variaveis sugeridas:

```bash
DATABASE_URL=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

Tabelas principais:

- `customer_profiles`
- `customer_addresses`
- `orders`
- `order_items`
- `assisted_purchase_consents`
- `supplier_purchases`
- `supplier_tracking_events`
- `payments`
- `support_threads`
- `audit_logs`

## Fornecedores e marketplaces

### Operacao manual MVP

Uso: atendimento compra no marketplace manualmente e registra os dados no admin.

Pegar:

- conta operacional Shopee;
- conta operacional AliExpress;
- metodo de pagamento usado pela loja para comprar do fornecedor;
- criterios de fornecedor homologado;
- planilha inicial de links de produto confiaveis.

Campos a registrar:

```bash
SUPPLIER_MODE=manual
```

### Shopee Open Platform

Uso futuro: consultar/gerenciar informacoes permitidas pela plataforma, quando houver acesso aprovado.

Pegar:

- Partner ID;
- Partner Key;
- Shop ID, quando aplicavel;
- access token/refresh token;
- URL de callback/OAuth;
- permissoes aprovadas para a aplicacao.

Variaveis sugeridas:

```bash
SHOPEE_PARTNER_ID=
SHOPEE_PARTNER_KEY=
SHOPEE_SHOP_ID=
SHOPEE_ACCESS_TOKEN=
SHOPEE_REFRESH_TOKEN=
SHOPEE_REDIRECT_URL=
```

Observacao: a Shopee Open Platform e voltada principalmente a integracoes de vendedor/loja. Para compra assistida como comprador, validar antes se existe permissao oficial para o fluxo desejado. Se nao houver permissao, manter operacao manual e registrar o pedido internamente.

Referencia: https://open.shopee.com/

### AliExpress / DSers / ferramenta homologada

Uso futuro: importar produtos, apoiar pedidos e sincronizar rastreio quando a ferramenta/API permitir.

Opcoes:

- AliExpress Open Platform, se a conta for aprovada para a API necessaria;
- DSers ou integrador homologado para dropshipping/fulfillment;
- operacao manual no AliExpress com registro interno no admin.

Pegar, se usar API direta:

- App Key;
- App Secret;
- access token/refresh token;
- callback URL;
- permissoes de dropshipping/order/logistics, se aprovadas.

Variaveis sugeridas:

```bash
ALIEXPRESS_APP_KEY=
ALIEXPRESS_APP_SECRET=
ALIEXPRESS_ACCESS_TOKEN=
ALIEXPRESS_REFRESH_TOKEN=
ALIEXPRESS_REDIRECT_URL=
```

Pegar, se usar DSers ou integrador:

- conta da ferramenta;
- credenciais/API key se disponivel;
- mapeamento produto interno -> produto fornecedor;
- regra de sincronizacao de rastreio.

Referencia: https://www.dsers.com/en/service

## Consulta de CEP

Uso: preencher endereco antes de enviar pedido para WhatsApp e antes de comprar no fornecedor.

Opcao simples:

- ViaCEP, sem chave obrigatoria.

Onde colocar:

```bash
NEXT_PUBLIC_CEP_PROVIDER=viacep
```

Referencia: https://viacep.com.br/

## Pagamento

Uso: gerar Pix/link/cartao, confirmar pagamento por webhook e liberar a compra no fornecedor.

Opcao recomendada para Brasil:

- Mercado Pago.

Pegar:

- public key;
- access token;
- webhook secret ou mecanismo de assinatura;
- URLs de webhook e retorno.

Onde colocar:

```bash
NEXT_PUBLIC_MERCADO_PAGO_PUBLIC_KEY=
MERCADO_PAGO_ACCESS_TOKEN=
MERCADO_PAGO_WEBHOOK_SECRET=
MERCADO_PAGO_SUCCESS_URL=
MERCADO_PAGO_FAILURE_URL=
MERCADO_PAGO_PENDING_URL=
```

Referencia: https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/payment-integration/pix

## Frete e rastreio

No modelo de compra assistida, o frete real pode vir do proprio fornecedor/marketplace. A loja deve registrar:

- frete cobrado do cliente;
- frete pago ao fornecedor;
- prazo prometido ao cliente;
- prazo informado pelo fornecedor;
- codigo de rastreio;
- transportadora;
- link publico de rastreio quando existir.

APIs opcionais:

- Correios API Prazo/Preco, se a loja tambem postar produtos diretamente;
- Melhor Envio, se a loja tiver estoque proprio ou precisar gerar etiquetas;
- API de rastreio da transportadora quando disponivel.

Variaveis sugeridas:

```bash
SHIPPING_PROVIDER=marketplace
CORREIOS_CLIENT_ID=
CORREIOS_CLIENT_SECRET=
CORREIOS_CONTRATO=
CORREIOS_CARTAO_POSTAGEM=
STORE_ORIGIN_CEP=
```

Referencias:

- https://www.correios.com.br/atendimento/developers/manuais/manual-api-preco-1
- https://www.correios.com.br/atendimento/developers/manuais/manual-api-prazo

## WhatsApp Business Platform / Cloud API

Uso futuro: enviar mensagens oficiais, receber webhooks e automatizar atualizacoes de pedido.

Pegar:

- Meta App ID;
- Meta App Secret;
- WhatsApp Business Account ID;
- Phone Number ID;
- access token permanente de system user;
- webhook verify token criado por nos;
- URL publica do webhook depois do deploy;
- templates aprovados para confirmacao, pagamento, rastreio e problema.

Onde colocar:

```bash
WHATSAPP_CLOUD_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_BUSINESS_ACCOUNT_ID=
WHATSAPP_WEBHOOK_VERIFY_TOKEN=
META_APP_SECRET=
```

Referencia: https://www.postman.com/meta/whatsapp-business-platform/documentation/wlk6lh4/whatsapp-cloud-api

## Nota fiscal

Fora do escopo do produto planejado. O backend nao deve gerar nota fiscal, DANFE,
XML nem depender de emissor fiscal/ERP. Qualquer documento externo deve ser
tratado fora do sistema TSZR15.

## Email transacional

Uso: enviar comprovante, resumo de pedido, atualizacoes e documentos.

Opcao:

- Resend.

Pegar:

- API key;
- email remetente validado;
- dominio autenticado.

Onde colocar:

```bash
RESEND_API_KEY=
RESEND_FROM_EMAIL=
```

## Ordem recomendada de implementacao

1. Banco de dados e pedido salvo.
2. Consentimento de compra assistida.
3. Painel admin para registrar compra em Shopee/AliExpress manualmente.
4. Mercado Pago para pagamento confirmado.
5. ViaCEP para reduzir erro de endereco.
6. Rastreio manual e notificacao por WhatsApp.
7. Automacao de Shopee/AliExpress somente depois de validar acesso oficial ou integrador homologado.
