# Ambientes: produção e staging

O projeto tem dois Workers na Cloudflare e (a partir daqui) dois projetos Supabase.
Nada de pagamento, tema ou automação é validado direto em produção.

| | Produção | Staging / preview |
| --- | --- | --- |
| Worker | `tsz-store` (`wrangler.jsonc`) | `tsz-store-preview` (`wrangler.preview.jsonc`) |
| Alvo declarado | `SUPABASE_RUNTIME_TARGET=production` | `SUPABASE_RUNTIME_TARGET=preview` |
| Projeto Supabase | `mckthvbwddxipghumrpw` (TSZR15) | `ywrpvhciugoomzejwdik` (TSZR15 preview) |
| Supabase | `NEXT_PUBLIC_SUPABASE_URL` | `NEXT_PUBLIC_SUPABASE_PREVIEW_URL` |
| Chave de serviço | `SUPABASE_SERVICE_ROLE_KEY` | `SUPABASE_PREVIEW_SERVICE_ROLE_KEY` |
| Token admin | `TSZR15_ADMIN_TOKEN` | `TSZR15_ADMIN_TOKEN` próprio do Worker |
| Access token | `MERCADOPAGO_ACCESS_TOKEN` | `MERCADOPAGO_SANDBOX_ACCESS_TOKEN` |
| Public Key | `NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY` | `NEXT_PUBLIC_MERCADOPAGO_SANDBOX_PUBLIC_KEY` |
| Segredo do webhook | `MERCADOPAGO_WEBHOOK_SECRET` | `MERCADOPAGO_WEBHOOK_SECRET` (o painel do provedor tem UM webhook só) |
| Deploy | `npm run deploy` (só a partir de `main`) | `npm run deploy:preview` |

## Desenvolvimento local

`npm run dev` roda contra o **preview**, nunca contra produção. Quem decide isso
é `.env.development.local`:

```
SUPABASE_RUNTIME_TARGET=preview
```

Next carrega esse arquivo antes do `.env.local` em `next dev` e o ignora no build
de produção. Ele não vai para o Git (`.gitignore` cobre `.env*.local`), então
cada máquina precisa criá-lo — sem ele, o alvo cai no padrão `production` e o
`npm run dev` local passa a cobrar de verdade no Mercado Pago.

## Como o ambiente é resolvido

`src/lib/runtime-target.js` lê **somente** `SUPABASE_RUNTIME_TARGET` (ou o par
público `NEXT_PUBLIC_SUPABASE_RUNTIME_TARGET`). Ausência significa produção;
valor diferente de `production`/`preview` é erro imediato.

Os dois `wrangler*.jsonc` declaram o alvo em `vars`, então nenhum deploy depende
de alguém lembrar de configurar a variável no painel.

Duas regras que existem por causa de falhas reais:

- **Não há detecção implícita por plataforma.** O código anterior usava
  `process.env.VERCEL_ENV === "preview"` como fallback. O deploy é Cloudflare
  Workers, onde essa variável nunca existe — o Worker de preview resolvia para o
  banco de produção em silêncio.
- **Preview não tem fallback para produção.** Antes, faltar
  `SUPABASE_PREVIEW_URL` fazia o preview usar as credenciais de produção. Hoje
  falta de configuração de preview significa "não configurado" (cliente nulo),
  nunca "usa produção".

## Credenciais de pagamento

O painel do Mercado Pago separa **teste** e **produção** em tudo: credenciais e
webhook, cada um com o seu próprio segredo de assinatura. O projeto espelha essa
separação em variáveis distintas, e o **nome da variável** é o que declara o
ambiente — não há heurística sobre o valor.

Staging lê **somente** as `MERCADOPAGO_SANDBOX_*`; produção lê **somente** as
outras. Sem fallback entre os dois conjuntos, mesma regra dos dois projetos
Supabase: staging sem credencial fica desligado, nunca cai na de produção.

Isso existe porque o prefixo não resolve. O provedor tem dois modelos de
sandbox:

1. **Credenciais de teste da aplicação** — o access token começa com `TEST-`.
2. **Usuário de teste** — uma conta fictícia cujas credenciais são "de produção"
   daquela conta e por isso começam com `APP_USR-`, idênticas em forma às reais.

No modelo 2 não há como distinguir a conta fictícia da conta real olhando o
token, e errar significa cobrar dinheiro de verdade num teste. Para descobrir o
que você tem em mãos, sem gerar cobrança:

```bash
npm run pagamento:verificar
```

O script chama `GET /users/me` — leitura pura — e o próprio Mercado Pago
responde se a conta é de teste (e-mail `@testuser.com`, apelido `TESTUSER`) ou
real. Com `-- --producao` confere o outro conjunto. O token nunca é impresso.

Ele também detecta o erro mais fácil de cometer: **Public Key colada no lugar
do Access Token**. No painel os dois ficam colados e têm o mesmo prefixo, e a
API só responde `invalid_token` sem dizer o motivo. A Public Key é
`PREFIXO + UUID` (41 caracteres); o Access Token é bem mais longo.

## Peculiaridades do sandbox, conferidas contra a API

- **O pagador é obrigatório no Pix.** Sem ele a API devolve
  `payer_cannot_be_nil`. O e-mail vem do pedido, nunca do corpo da requisição.
- **E-mail `@testuser.com` é recusado como pagador** (`Payer email forbidden`).
  Um endereço comum funciona.
- **Cobrança pendente volta com `net_received_amount: 0`, não nulo.** Zero aqui
  significa "ainda não liquidado"; tratá-lo como valor real faria a margem
  provisória virar prejuízo inventado.

## Guard de coerência

`src/lib/environment-guard.js` derruba o boot (`instrumentation.js`) e a criação
do cliente com service role quando encontra mistura:

- URL de preview igual à de produção;
- chave de serviço de preview igual à de produção;
- alvo preview com apenas a chave de serviço de produção presente;
- mesma credencial de pagamento nas variáveis de sandbox e de produção;
- access token com prefixo `TEST-` na variável de produção;
- alvo preview com a credencial de produção presente e nenhuma de sandbox;
- `TSZR15_PREVIEW_ADMIN_TOKEN` igual ao token de produção.

Configuração **ausente** não é erro fatal — o projeto inteiro degrada com cliente
nulo quando falta variável, e transformar isso em exceção derrubaria produção por
omissão. O guard só reage a mistura detectável.

## Ciclo de trabalho

```bash
npm run clone:preview
```

```bash
npm run deploy:preview
```

1. Aplique a migração da fase **primeiro no projeto Supabase de preview**
   (SQL Editor), nunca em produção.
2. `npm run clone:preview` copia catálogo, categorias, custos e cupons de
   produção para o projeto de preview. Ele não copia pedidos, clientes nem
   pagamentos.
3. `npm run deploy:preview` faz build **com o alvo fixado** e publica em
   `tsz-store-preview`. O alvo precisa estar no ambiente do build, não só no do
   runtime: o Next inlina as variáveis `NEXT_PUBLIC_*` no bundle do navegador
   durante o build, então reaproveitar um build de produção no Worker de preview
   entregaria um bundle client apontando para o Supabase de produção.
4. Exercite o fluxo em `https://tsz-store-preview.enz-luizgustavo.workers.dev`.
5. Só então aplique a migração em produção e faça o merge para `main`.

## Promoção para produção

1. Migração aplicada no projeto de produção (manual, SQL Editor).
2. Merge para `main` — o pipeline publica.
3. Conferir no log de boot o evento `environment_resolved` com `target: production`.

Rollback: reverter o merge e republicar. Migração aditiva não precisa de
rollback; migração destrutiva não deve existir neste projeto.

## Estado do provisionamento

As 23 migrações do repositório estão aplicadas no projeto de preview, com as
versões do ledger (`supabase_migrations.schema_migrations`) iguais aos prefixos
dos arquivos — `supabase db push` contra o preview não reaplica nada.

O Supabase de staging está **funcionando**, verificado contra o banco: a chave
de serviço lê o catálogo e as três tabelas da fase 3 (`order_ledger`,
`payment_webhook_events`, `supplier_purchases`).

O Mercado Pago de sandbox também: `npm run pagamento:verificar` confirma conta
de teste, e uma cobrança Pix real foi criada no sandbox com QR válido.

O segredo do webhook (`MERCADOPAGO_WEBHOOK_SECRET`) vale para os dois ambientes:
o painel do provedor tem **um** webhook, não um por aplicação. Sem ele o
pagamento fica desligado (`isOnlinePaymentEnabled` exige token E segredo),
porque um webhook sem assinatura validada aceitaria confirmação de qualquer
origem.

Ainda falta uma variável, opcional para o staging subir mas necessária para o
fluxo completo:

- `TSZR15_PREVIEW_ADMIN_TOKEN` — token do admin no staging, obrigatoriamente
  diferente do de produção.

Para empurrar tudo de uma vez para o Worker: `npm run preview:configurar -- --enviar`.

## Isolamento de cache

O staging tem namespaces KV próprios (`NEXT_INC_CACHE_KV_PREVIEW` e
`NEXT_TAG_CACHE_KV_PREVIEW`); antes os dois Workers dividiam o mesmo, e uma
revalidação disparada em staging podia invalidar tags da loja no ar.

`next.config.mjs` deriva os hostnames de `images.remotePatterns` das variáveis
de ambiente, então imagem hospedada no projeto de preview não é mais bloqueada
pelo `next/image`. Sem variável (build em CI), cai no hostname de produção.

## Pendências conhecidas

- **`wrangler.jsonc` de produção aponta `NEXT_INC_CACHE_KV` e
  `NEXT_TAG_CACHE_KV` para o MESMO namespace.** É anterior a este trabalho e
  não afeta o isolamento entre ambientes, mas mistura cache incremental com
  cache de tags dentro da produção. Separar exige criar um namespace e
  republicar.
