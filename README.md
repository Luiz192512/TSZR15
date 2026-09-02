# TSZR15 WhatsApp Business

Loja Yamaha R15 em `Next.js` com home estilo marketplace, catalogo, busca, filtros, conta de cliente, dados de entrega, carrinho e fechamento por WhatsApp Business. O modelo planejado agora e de compra assistida: o cliente compra conosco e a operacao usa os dados autorizados para comprar/enviar o item por Shopee, AliExpress ou fornecedor homologado.

## O que esta implementado

- catalogo curado e filtrado para Yamaha R15
- home principal inspirada na navegacao da OLX, sem fluxo de anuncio de terceiros
- login, cadastro e pagina de conta com Supabase Auth
- perfil de cliente, endereco principal e consentimento de compra assistida
- precos, variacoes e disponibilidade por SKU
- carrinho com ajuste de quantidade
- preenchimento do checkout com dados da conta quando o cliente esta logado
- selecao de forma de pagamento
- selecao de frete estimado ou frete a combinar
- resumo com subtotal, frete e total
- geracao automatica da mensagem para WhatsApp Business
- link `wa.me` com a mensagem codificada
- API interna `POST /api/checkout/whatsapp` para validar o carrinho, salvar o pedido e montar a mensagem no backend
- pedido interno com snapshot do cliente, endereco, itens, pagamento manual e status operacional
- tabelas internas para compra em fornecedor, rastreio, suporte e auditoria
- painel admin protegido por token para atualizar pagamento, origem interna e rastreio
- pagina publica de rastreio por numero de pedido e contato, sem expor fornecedor/origem interna
- validacao automatica do catalogo e do contrato de checkout

## Configuracao

Crie um `.env.local` a partir do `.env.example`:

```bash
NEXT_PUBLIC_WHATSAPP_BUSINESS_NUMBER=5511999999999
WHATSAPP_BUSINESS_NUMBER=5511999999999
NEXT_PUBLIC_STORE_NAME=TSZR15
NEXT_PUBLIC_SUPABASE_URL=https://SEU_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sua_publishable_key
SUPABASE_SERVICE_ROLE_KEY=sua_service_role_key
TSZR15_ADMIN_TOKEN=crie_um_token_longo_para_o_painel_admin
```

`NEXT_PUBLIC_WHATSAPP_BUSINESS_NUMBER` e `WHATSAPP_BUSINESS_NUMBER` devem ficar no formato internacional, apenas numeros:

```bash
55 + DDD + numero
```

Exemplo: `5511999999999`.

Para contas de cliente, pegue no Supabase:

- `NEXT_PUBLIC_SUPABASE_URL`: Project Settings -> API -> Project URL.
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: Project Settings -> API -> Project API keys -> publishable key.
- `SUPABASE_SERVICE_ROLE_KEY`: Project Settings -> API -> service_role key. Guarde apenas no servidor; a API usa essa chave para registrar pedidos de convidados.

Depois aplique a migracao:

```bash
npx supabase login
npx supabase link --project-ref SEU_PROJECT_REF
npx supabase db push
```

O Supabase CLI esta instalado localmente como dependencia de desenvolvimento, entao use `npx supabase`.

## Rotas

- `/`: vitrine, carrinho e fechamento via WhatsApp Business
- `/entrar`: login do cliente
- `/cadastrar`: cadastro do cliente com dados de compra
- `/conta`: perfil, endereco principal e consentimento
- `/rastreio`: consulta publica de status, transportadora e codigo de rastreio
- `/admin`: painel interno para atualizar pagamento, compra em fornecedor e rastreio
- `/api/catalog`: JSON do catalogo publicado
- `/api/checkout/whatsapp`: valida o pedido no backend, salva no Supabase quando configurado e retorna mensagem, totais e URL de checkout para WhatsApp

## Scripts

```bash
npm install
npm run dev
npm run build
npm run validate
npm test
npx supabase --version
```

## APIs e credenciais

A lista do que precisa ser obtido para evoluir do MVP manual para automacao esta em [`docs/APIS-NECESSARIAS.md`](docs/APIS-NECESSARIAS.md).

Para a vitrine funcionar, basta configurar o numero do WhatsApp Business. Para login/cadastro, dados salvos e pedidos internos, configure Supabase e aplique `supabase/migrations/20260520_customer_accounts.sql`. Com `SUPABASE_SERVICE_ROLE_KEY`, a API tambem consegue registrar pedidos de clientes sem login; sem essa chave, convidados ainda abrem o WhatsApp, mas o pedido nao fica persistido. O painel `/admin` tambem depende de `SUPABASE_SERVICE_ROLE_KEY` e `TSZR15_ADMIN_TOKEN`; acesse por `/entrar` usando `admin` no campo de e-mail e o valor de `TSZR15_ADMIN_TOKEN` como senha.

As APIs de pagamento, banco, WhatsApp Cloud API e marketplace entram quando o projeto for confirmar pagamento automaticamente ou automatizar parte da operacao com fornecedores externos. O rastreio manual ja pode ser registrado no admin e consultado pelo cliente. Nota fiscal, DANFE, XML e emissor fiscal/ERP ficaram fora do escopo do produto planejado.
