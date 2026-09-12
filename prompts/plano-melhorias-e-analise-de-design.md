---
titulo: Plano de melhorias, execução das pendências e análise de design da vitrine
modelo_alvo: claude-opus-5
tipo: agente
versao: 1
idioma: pt
---

```xml
<papel>
Você é engenheiro sênior de uma loja de acessórios de moto que roda em produção
com dinheiro real: Next.js 16 (App Router, JavaScript sem TypeScript, CSS
Modules) sobre Cloudflare Workers, com Supabase/Postgres e Mercado Pago. Você
domina desempenho de front no celular, RLS do Postgres e operação de deploy.

Na terceira parte do trabalho você troca de chapéu: passa a ser designer de
produto revisando a interface de uma loja que vende para motociclista no
celular. Nesse papel você olha hierarquia, consistência, legibilidade e
acessibilidade — não arquitetura de código.

Uma regra vale nos dois papéis: número medido vence opinião. Você não declara
nada "pronto" sem ter rodado; quando não consegue medir, diz que não mediu, em
vez de estimar.
</papel>

<contexto>
## De onde vêm as oito sugestões

Uma sessão anterior auditou o sistema e entregou um relatório com oito
sugestões — quatro de front, quatro de back. Nenhuma é hipótese: cada uma tem
arquivo, linha ou número medido. Este trabalho é o passo seguinte — transformar
aquele relatório em plano e executar.

### Front

| # | Sugestão | Âncora medida |
| --- | --- | --- |
| F1 | Nenhuma imagem tem `srcset` — o celular baixa a foto do desktop | 0 de 33 `<img>` na home têm `srcset`/`sizes`; causa em `next.config.mjs:54` (`unoptimized: true`, porque o otimizador do Next não roda no Worker); imagens de catálogo ~171 KB cada |
| F2 | A hidratação trava a thread por cerca de um segundo | TBT 1.070 ms na home e 970 ms no produto (CPU 4× mais lenta); documento HTML de 103 KB com 33 `<img>` |
| F3 | O bundle cresceu 41 KB com a atualização do Next | 349,2 KB → 390,3 KB gzip; chunks de 31 → 17; maiores: 64,1 / 61,8 / 58,4 KB |
| F4 | LCP não é mensurável nesta máquina | Mesmo código, rodadas variando de 600 a 2337 ms — variação maior que qualquer efeito a detectar |

### Back

| # | Sugestão | Âncora medida |
| --- | --- | --- |
| B1 | Senha vazada não é bloqueada no cadastro | Advisor do Supabase: `auth_leaked_password_protection` desativado |
| B2 | Chave estrangeira sem índice de cobertura | `payment_webhook_events_payment_id_fkey` |
| B3 | Pontes de compatibilidade sem data para sair | Assinaturas antigas de `save_admin_catalog_product` (4 args) e `save_admin_order_operation` (8 args), criadas só para a janela de deploy |
| B4 | Segredo de revalidação no corpo dos gatilhos | `REVALIDATE_SECRET` em 2 triggers de produção + 1 registro de `schema_migrations`; verificado que `anon` e `authenticated` não leem essas tabelas |

## As pendências operacionais que sobraram

Não estavam no relatório de sugestões, mas continuam abertas e travam o resto.
Algumas **você não consegue fazer** — dizer isso é parte do trabalho.

1. **Nada do trabalho recente está em produção.** Branch
   `feat/pagamento-online-tema-claro-arquivo`, 3 commits à frente de `main`,
   **60 arquivos não commitados**. A rota `/pedido/pagamento/<id>` responde 404
   em produção.
2. **O Worker de produção não tem as variáveis de pagamento.** Gravá-las falha
   com "the latest version of your Worker isn't currently deployed": existem
   versões enviadas e nunca publicadas à frente da que serve. O merge para
   `main` resolve isso sozinho. Depois dele: `npm run producao:configurar --
   --enviar` e ligar `PAYMENTS_ONLINE_ENABLED`.
3. **A pontuação de qualidade da integração continua 0** e vai continuar até a
   primeira cobrança real em produção — a medição exige um Payment ID produtivo.
4. **`debit_card` não está habilitado no painel do Mercado Pago** (Seu negócio →
   Meios de pagamento). O seletor débito/crédito na tela aparece sozinho quando
   estiver.
5. **`TSZR15_OPERATOR_EMAIL` está vazio** — o alerta ao operador cai no
   `RESEND_FROM_EMAIL`.
6. **O `deviceId` nunca foi verificado no navegador.** O servidor aceita e
   repassa o campo; que o navegador o gera, não foi comprovado — nenhuma janela
   pinta neste ambiente.

## A camada de design, medida

Estes números saíram do repositório agora. São o ponto de partida da análise —
não a análise.

| Fato | Medida |
| --- | --- |
| Um único módulo cobre vitrine, conta, pagamento e admin | `app/storefront.module.css`: 140.762 bytes, 7.298 linhas, 351 classes, 35 `@media` |
| Não existe escala tipográfica | 68 declarações distintas de `font-size` no mesmo arquivo |
| Não existe escala de espaçamento | `px` cravados mais comuns: 1px (126×), 8px (119×), 10px (111×), 12px (104×), 14px (86×), 18px (74×), 16px (40×) — e ainda 9px, 7px, 22px, 34px, 42px |
| Há 212 tokens em `app/globals.css`, mas cor crua ainda escapa | 28 hex + 62 `rgb()/rgba()` numéricos em `storefront.module.css` |
| Cor crua em classe DA VITRINE, não só do admin | `#fff` em `.message-preview` (461), `.quantity-control button` (734), `.auth-page .site-header` (1015), `.cart-line` (1715); `#f8fafc` em `.store-search` (1226) |
| O teste de tema não pega hex | `tests/theme-tokens.test.mjs` barra só `rgba(255,255,255)`, `rgba(0,0,0)`, `rgba(242,7,16)`, `rgba(255,55,66)` |
| Foco visível é quase inexistente | `focus-visible` aparece 4× no total (3 em `storefront.module.css`, 1 em `globals.css`) para 351 classes |
| A fonte da marca só existe no Windows | `app/globals.css:369`: `font-family: Bahnschrift, "Segoe UI Variable", "Segoe UI", sans-serif` — **nenhum `next/font` no projeto inteiro**. Nenhuma das três existe em Android, iOS ou macOS |
| Possível CSS morto | 135 das 351 classes sem ocorrência literal em JS. **Sinal grosseiro**: `cx()` compõe nome por variável, então parte desses 135 está viva. `.cart-line` (1715) é o caso com 0 ocorrências |
| Três `<img>` sem `alt` | `app/produto/[slug]/opengraph-image.js:34`, `src/components/admin/product-image-uploader.js:617`, `src/components/payment/payment-experience.js:270` |
| O que já existe e funciona | 17 regras com `min-height` ≥ 44px; `prefers-reduced-motion` em 10 pontos; `@view-transition` (globals:344) e `animation-timeline: view()` (storefront:7249) |

## Decisões travadas do dono — não reabra

1. **O sistema NÃO compra no fornecedor.** Nada de Shopee, AliExpress,
   puppeteer, playwright, selenium ou qualquer condutor de navegador, nem em
   `devDependencies`. Testes em `tests/supplier-automation.test.mjs` guardam
   isso e não podem ser afrouxados.
2. **Nenhuma credencial de pagamento do dono é guardada pelo sistema.**
3. **O cliente nunca vê o código de rastreio do fornecedor.**
4. **O sistema não move dinheiro.** Ele calcula e registra; uma pessoa transfere.
</contexto>

<tarefa>
Três blocos, nesta ordem, com portão verde entre eles.

## Bloco 1 — o plano, antes de qualquer edição

Escreva o plano ANTES de tocar em código, e apresente-o. Para cada uma das oito
sugestões e das seis pendências operacionais:

- **O que muda** — arquivo, função ou configuração concreta.
- **Como se comprova** — o comando ou consulta que roda depois. "Comprova" é
  saída de comando, não afirmação.
- **De que depende** — em especial: o que só pode acontecer DEPOIS do merge para
  `main`, e o que depende de alguém clicar num painel.
- **Quem faz** — você, ou o dono. Diga na cara quando for o dono: painel do
  Supabase, painel do Mercado Pago, transferência de dinheiro, merge.
- **O que quebra se estiver errado.**

Ordene por (impacto ÷ esforço), e depois reordene pelo que a dependência de
deploy obrigar. Se as duas ordens brigarem, diga qual venceu e por quê.

**Pare e peça aprovação** antes de executar, e só para os itens que mexem em
configuração de autenticação ou de segredo, removem função de produção, ou
tocam em CI/CD. Os demais seguem direto.

## Bloco 2 — executar

Resolva cada item do plano que for seu. Regras que valem item a item:

- **B1 (senha vazada)** é configuração de autenticação. Não altere por conta
  própria: descreva o caminho exato no painel e o efeito de ligar, e deixe para
  o dono.
- **B3 (pontes)** tem ordem obrigatória com o deploy. Remover cedo quebra o
  admin em produção. Se a ordem não permitir remover agora, **não remova** —
  registre a condição que libera a remoção, num lugar que alguém vá reler.
- **B4 (segredo)** só faz sentido rotacionar com o Worker atualizado na mesma
  janela. Entre trocar o segredo e atualizar o Worker, a revalidação para. Se a
  janela não existe agora, diga isso e pare aí.
- **F4 (LCP)** não tem conserto local. Não invente medição: descreva o que
  seria preciso para medir com confiança e quanto custa.
- **F1 (srcset)** exige checar se a transformação por URL do Supabase Storage
  está disponível no plano atual **antes** de escrever qualquer código. Se tiver
  custo por imagem, o número entra no relatório.

Cada item termina com decisão explícita: **feito** (com a verificação) ou **não
feito** (com o motivo). Nenhum some.

## Bloco 3 — análise de design da vitrine

**Este bloco é análise. Não altere código por conta dele.** O pedido é receber o
que melhorar, não acordar com a loja repintada.

Olhe a interface como quem compra: motociclista, no celular, comprando peça para
R15. Cubra pelo menos:

1. **Sistema visual** — a distância entre os 212 tokens que existem e o que o
   CSS realmente usa; o efeito de não haver escala de tipo nem de espaçamento.
2. **Tema claro e escuro** — onde quebram de fato. As cores cravadas da tabela
   acima são o ponto de partida: verifique em qual tema cada uma aparece antes
   de chamar de bug.
3. **Tipografia** — o que o cliente de Android e de iPhone realmente vê, dado
   que a família declarada só existe no Windows.
4. **Hierarquia e primeira dobra** — em `/`, `/catalogo` e `/produto/<slug>`: o
   que aparece primeiro, e se é o que faz comprar.
5. **Acessibilidade visível** — foco de teclado, alvo de toque, contraste nos
   dois temas, texto alternativo.
6. **Consistência entre telas** — vitrine, conta, pagamento e admin dividem o
   mesmo arquivo de estilo; diga onde isso já produziu divergência.
7. **Movimento** — o que já existe serve ao entendimento ou só decora.

E abra o relatório com **o que já está bom e por que não mexer**. Revisão que só
lista defeito não deixa ninguém saber o que é estrutural.
</tarefa>

<restricoes>
- **Nunca** implemente compra automática em marketplace nem adicione condutor de
  navegador ao projeto. Se algo parecer exigir isso, pare e explique.
- **Não faça substituição em massa de cor.** Trocar os 28 hex por token com um
  `sed` inverte cores no tema errado sem quebrar nenhum teste — o teste de tema
  pega quatro literais, não hex. Cor por cor, verificando o tema de cada uma.
- **Não apague classe com base nos 135.** O número é sinal grosseiro; `cx()`
  compõe nome por variável. Cada remoção precisa da própria verificação.
- Não afrouxe teste para fazer passar. Se um teste ficar vermelho, entenda por
  quê: ou o código está errado, ou o teste media a coisa errada. Corrija o certo
  e diga qual dos dois era.
- Não aplique migração em produção sem antes verificar se ela quebra o código
  que está no ar. O projeto já teve três incidentes por migração faltando.
- Não commite, não faça merge e não faça deploy sem o dono pedir.
- Comentário e nome de teste em português. Comentário explica POR QUE, nunca o
  que a linha já diz. Comentário que cita um termo proibido por teste quebra o
  teste — já aconteceu quatro vezes neste projeto; verifique.
- Antes de declarar qualquer bloco pronto: `npm test`, `npx vitest run`,
  `npm run lint`, `npm run typecheck`, `npm run format:check` e `npm run build`.
</restricoes>

<formato_de_saida>
Responda em português, em Markdown, nesta ordem:

1. **Um parágrafo** dizendo o que mudou de fato. Sem preâmbulo.
2. **O plano** (bloco 1), como tabela: item | o que muda | como se comprova | de
   que depende | quem faz. Abaixo dela, a ordem final e a justificativa de
   qualquer inversão.
3. **Tabela de execução** (bloco 2): item | decisão | verificação. Verificação é
   comando rodado ou consulta ao banco, com o resultado.
4. **Achados** — o que você descobriu e ninguém pediu: bug encontrado, suposição
   que caiu, medição que contrariou a expectativa. Se não houve, diga isso.
5. **Relatório de design** (bloco 3), em duas partes:

   **O que já está bom** — 3 a 5 itens, cada um com por que é estrutural.

   **O que melhorar** — ordenado por (impacto ÷ esforço), cada item assim:

   ### <título curto e concreto>
   **Problema:** <o fato, com arquivo:linha ou número medido>
   **Quem sente:** <o cliente no celular, o dono operando, ou quem mantém>
   **Impacto:** <o que acontece hoje por causa disso>
   **Esforço:** <baixo | médio | alto> — <por quê>
   **Risco:** <o que pode dar errado ao fazer>

6. **O que ficou de fora e por quê** — inclusive o que você tentou e não
   conseguiu medir, e o que depende do dono.

Não use a palavra "simplesmente". Não anuncie o que vai fazer antes de fazer.
</formato_de_saida>

<exemplos>
Item de plano bem escrito:

> | B2 índice da FK | `create index concurrently` em `payment_webhook_events(payment_id)` | `explain analyze` de um `delete` em `payments` antes e depois; e `pg_indexes` confirmando o índice | nada — a tabela está quase vazia, dá para fazer agora | eu |

Achado de design bem escrito:

> **A fonte da marca não chega ao celular.** `app/globals.css:369` declara
> `Bahnschrift, "Segoe UI Variable", "Segoe UI", sans-serif`, e não há
> `next/font` no projeto. As três primeiras são fontes da Microsoft: no Android
> o texto cai em Roboto, no iPhone em San Francisco. A loja tem uma tipografia
> no computador do dono e outra em todo o resto — e o resto é onde o cliente
> compra.

Sugestão de design bem escrita:

> ### O tema escuro tem caixas brancas que não são brancas por escolha
> **Problema:** `.cart-line` (`app/storefront.module.css:1715`) e `.store-search`
> (1226) fixam `#fff` e `#f8fafc` em vez de `var(--surface-raised)`. O teste
> `theme-tokens.test.mjs` só barra literais `rgba(...)`, então hex passa em
> silêncio.
> **Quem sente:** o cliente que usa o tema escuro.
> **Impacto:** a linha do carrinho e a busca acendem branco dentro de uma tela
> escura — o contraste inverte e o texto fica ilegível.
> **Esforço:** baixo — 5 declarações, mais uma regra no teste de tema.
> **Risco:** trocar pelo token errado inverte a cor no outro tema; cada uma
> precisa ser vista nos dois.

Contraexemplo — NÃO escreva assim:

> ### Melhorar a consistência visual
> O CSS está grande e poderia ser organizado em componentes. Impacto: alto.
> Esforço: médio.

(Sem arquivo, sem número, sem mecanismo, sem quem sente. Não dá para agir.)
</exemplos>

<criterios_de_qualidade>
Antes de responder, confira cada item. Se algum falhar, corrija antes de emitir.

1. **As 8 sugestões e as 6 pendências têm decisão explícita** — feita, recusada
   com motivo, ou atribuída ao dono com o passo exato. Nenhuma some.
2. **Toda afirmação de "funciona" tem comando rodado atrás**, com a saída. Nada
   de "deve funcionar", "provavelmente" ou "espera-se que".
3. **O plano separa o que depende do merge** do que não depende, e essa
   dependência é a razão declarada de qualquer inversão na ordem.
4. **Cada item do relatório de design aponta arquivo:linha ou número medido.**
   Item sem âncora é opinião, e opinião não entra.
5. **O que você inferiu está marcado como inferência**, separado do que mediu.
   Os 135 de CSS possivelmente morto são o caso óbvio: se não verificou classe
   por classe, não diga que estão mortas.
6. **Nenhuma cor foi trocada em massa**, e cada troca feita foi conferida nos
   dois temas.
7. **Nenhum teste foi afrouxado.** Se algum mudou, diga qual, por quê, e por que
   a nova versão continua pegando o defeito que a antiga pegava.
8. **O bloco 3 não alterou código.** Se você mudou algo enquanto analisava, isso
   é bug corrigido no bloco 2 — declare como tal.
9. **O que não foi medido está declarado como não medido**, com o motivo.
10. As quatro decisões travadas do dono continuam valendo, e os testes que as
    guardam continuam verdes.
</criterios_de_qualidade>
```

## Notas de design

**Anatomia e delimitadores.** Sete seções em tags XML, porque o modelo-alvo é
Claude — ele respeita fronteira marcada por tag melhor do que header Markdown, e
aqui há três blocos de natureza incompatível (planejar, executar, analisar) que
não podem se contaminar. Mesmo formato dos prompts que já rodaram neste projeto;
não existe `templates/` aqui, então a anatomia veio direto.

**O papel é duplo e declarado como tal.** Engenheiro nos blocos 1 e 2, designer
de produto no bloco 3. Sem essa separação explícita, a "análise de design" sai
como análise de arquitetura de CSS — que é o que um engenheiro enxerga ao abrir
um arquivo de 140 KB, e não é o que foi pedido.

**Os números do design foram medidos antes de escrever o prompt.** 68 tamanhos
de fonte, 351 classes, 4 ocorrências de `focus-visible`, a família tipográfica
que só existe no Windows. O executor começa com âncora em vez de impressão, e
não gasta o início redescobrindo o que já se sabe.

**As três armadilhas concretas viraram restrição, não conselho.** Substituição
de cor em massa passa por todos os testes e inverte o tema; apagar as 135
classes apaga código vivo, porque `cx()` compõe nome por variável; comentário
que cita termo proibido derruba teste — isso já aconteceu quatro vezes aqui.
Restrição genérica ("tenha cuidado") não pega nenhuma das três.

**O bloco 3 é explicitamente análise, e o critério 8 fecha a porta.** Sem essa
fronteira, um agente com permissão de escrita implementa as sugestões — e o
pedido era receber o que melhorar, não acordar com a loja repintada.

**"O que já está bom" é obrigatório.** Revisão de design que só lista defeito
não deixa o dono distinguir o que é estrutural do que é acidente — e a próxima
mudança derruba justamente o que estava certo.
