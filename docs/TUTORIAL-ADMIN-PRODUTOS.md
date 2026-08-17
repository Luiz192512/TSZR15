# Tutorial do admin — aba Produtos

Guia de operação da aba **Produtos** do painel `/admin`: o que cada campo significa, o que
escrever em cada um, como funcionam os cards de variação/estoque/foto e o que muda na vitrine
quando você salva.

Referências de código: `app/admin/page.js` (tela), `app/admin/actions.js` (ações),
`src/admin/catalog-admin.js` (validações), `src/admin/catalog-variations.js` (variações e
estoque), `src/admin/catalog-product-images.js` (upload), `src/components/admin/product-image-uploader.js`
(cards), `src/catalog/categories.js` (categorias e famílias), `src/catalog/stock.js` (efeito na vitrine).

Para a aba Pedidos, veja [TUTORIAL-ADMIN-PEDIDOS.md](./TUTORIAL-ADMIN-PEDIDOS.md).

---

## 1. Abrir a aba

Entre em `/admin` (login em `/entrar?next=/admin` com o token administrativo) e clique em
**Produtos**, ou vá direto em `/admin?tab=produtos`.

---

## 2. Como a tela é organizada

- **Coluna da esquerda — Catálogo:** **24 produtos por página**, ordenados por publicados
  primeiro, depois pelos editados mais recentemente, depois por nome. Cada linha mostra nome,
  categorias, se está **Publicado** ou **Arquivado** e o lucro unitário quando há custo cadastrado.
  No rodapé há **Anterior / Próxima** quando existe mais de uma página.
- **Primeiro item da lista — "Adicionar produto":** abre um card de produto em branco. Clicar de
  novo abre mais um rascunho ao mesmo tempo (até 12). O contador aparece na URL como
  `?novosProdutos=N`.
- **Coluna da direita:** o formulário do produto selecionado (ou os rascunhos novos) e, no fim, o
  botão de arquivar.

O total de produtos aparece no topo da lista.

---

## 3. Bloco "Identificação do produto"

| Campo | Obrigatório | O que colocar |
| --- | --- | --- |
| Nome | Sim | Nome comercial, como aparece na vitrine. Ex.: `Ponteira SC Project` |
| Slug / ID | Não | Identificador da URL pública. Ex.: `slider-r15-preto`. Vazio = gerado a partir do nome |
| Família técnica | Sim | Classificação interna do produto (lista fechada) |

Sobre o slug:

- Ele é normalizado automaticamente: acentos são removidos, tudo vira minúsculo e espaços/símbolos
  viram hífen. `Ponteira SC Project` vira `ponteira-sc-project`.
- O slug é o endereço público (`/produto/<slug>`). **Trocar o slug de um produto já publicado muda
  o link** — quem tinha o link antigo perde a página.
- Slug repetido gera o erro "Ja existe um produto com este slug/ID.".

Famílias técnicas disponíveis: `aero_front`, `iluminacao`, `retrovisor`, `controles`, `slider`,
`protecao`, `escapamento`, `adesivo_full`, `adesivo_detalhe`, `tanque`, `cockpit`, `manutencao`.

---

## 4. Bloco "Preço e operação"

| Campo | Obrigatório | O que colocar |
| --- | --- | --- |
| Preço do cliente | Sim | Valor cobrado na vitrine. `199,90`, `199.90` ou `2.490,00`. Precisa ser maior que zero |
| Preço real interno | Não | Quanto o produto custa para você. Aceita `0`. **Nunca aparece no site** |
| Disponibilidade | Não | Texto livre exibido como situação. Padrão `sob-consulta` |
| Prazo em dias úteis | Não | Inteiro ≥ 0. Padrão `2` |
| Frete | Não | Classe de frete: `light`, `medium`, `heavy`… Padrão `medium` |

**Lucro estimado do produto** é só um painel de leitura: mostra preço do cliente menos preço real
e a margem em %. Ele aparece depois que o produto é salvo com custo — em um produto novo, exibe
"Informe o preco real para calcular".

Preencher o preço real é o que faz o lucro por produto e o lucro da loja (aba Análise) baterem.
Deixar em branco não bloqueia nada, mas o produto entra nos relatórios sem custo conhecido.

---

## 5. Bloco "Categorias e compatibilidade"

| Campo | Obrigatório | O que colocar |
| --- | --- | --- |
| Categorias | Sim (pelo menos 1) | Onde o produto aparece na vitrine |
| Escopo técnico | Não | Modelos compatíveis, separados por vírgula ou quebra de linha. Até 8 itens. Padrão `yamaha-r15` |

Categorias disponíveis: **Suporte & Sliders**, **Estética**, **Escapamentos**, **Adesivagem**,
**Manutenção**. Salvar sem nenhuma marcada gera "Selecione pelo menos uma categoria.".

Um produto pode estar em mais de uma categoria — marque todas em que faz sentido buscá-lo.

---

## 6. Bloco "Vitrine" — variações, estoque e fotos

Essa é a parte mais importante da aba. Tudo fica em **cards**: um card por variação, com o nome,
o estoque e as fotos daquela variação juntos.

### 6.1 Campos de cada card

| Campo | O que colocar |
| --- | --- |
| Nome da variação | Obrigatório. Ex.: `Preto`, `Fumê`, `Alumínio`. É o texto que o cliente escolhe |
| Estoque disponível | Número inteiro ≥ 0, **ou vazio** |
| Adicionar fotos | Abre o seletor de imagens do card |

O que o estoque faz na vitrine:

| Valor | Vitrine | Carrinho |
| --- | --- | --- |
| Vazio | "Consultar disponibilidade" | Permite comprar sem controle de estoque |
| `0` | "Esgotado" | Bloqueia a compra da variação |
| `N` | "N em estoque" | Permite comprar e desconta a cada pedido |

Alguns nomes são padronizados sozinhos ao salvar: `padrao` → **Padrão**, `fume` → **Fumê**,
`aluminio` → **Alumínio**, `holografico` → **Holográfico**.

### 6.2 Organizar os cards

- **Adicionar variação** cria um card novo (máximo de 24 por produto).
- **Subir / Descer** ou arrastar pelo cabeçalho reordena. A ordem dos cards é a ordem que o
  cliente vê — e o estoque e as fotos acompanham o card na nova posição.
- **Remover** apaga a variação. O último card não pode ser removido: todo produto precisa de pelo
  menos uma variação.

### 6.3 Fotos

- Ao escolher uma imagem, abre o **enquadramento 4:3** com Zoom (1× a 2,4×), Horizontal e
  Vertical. Ajuste e clique em **Adicionar ao card** — a foto é convertida para WebP 1200×900.
  **Pular imagem** descarta aquela foto e passa para a próxima da fila.
- Formatos aceitos: **JPG, PNG, WEBP ou GIF**, até **5 MB cada** (antes do recorte).
- Limite de **12 fotos por produto**, somando todos os cards. Ao passar do limite aparece
  "O produto pode ter no máximo 12 imagens.".
- A **primeira foto de cada card é a capa da variação**; as outras entram como fotos adicionais.
  Use **Anterior / Próxima** para trocar a ordem dentro do card.
- **Remover** tira a foto do card. Ao salvar, as fotos que saíram são apagadas do storage — não dá
  para desfazer depois de salvar.

### 6.4 Notas e publicação

| Campo | O que colocar |
| --- | --- |
| Notas | Descrição/observações do produto (até 1800 caracteres) |
| Publicado na vitrine | Marcado = aparece no site. Desmarcado = fica só no admin |

---

## 7. Salvar o produto

O botão **Salvar produto** faz upload das fotos novas, grava o produto, o custo e o estoque em uma
única operação e revalida as páginas do catálogo. Sucesso mostra "Produto salvo no catalogo." e a
tela volta com o produto selecionado.

Se a gravação falhar, as fotos recém-enviadas são removidas do storage — não fica lixo pela metade.
O botão também ignora duplo clique, então não dá para salvar duas vezes sem querer.

### Dois cuidados importantes

1. **O estoque digitado no formulário vira a verdade.** Salvar um produto reescreve as linhas de
   estoque com exatamente o que está nos cards. Se a página ficou aberta enquanto entraram pedidos
   (que descontam do estoque), salvar restaura o número antigo. Recarregue a página antes de
   salvar produtos de itens que estão vendendo.
2. **Renomear uma variação quebra o vínculo do estoque.** O estoque é ligado ao *nome* da
   variação. `Preto` renomeado para `Preto fosco` vira uma linha nova, e pedidos antigos continuam
   referenciando o nome anterior. Prefira criar uma variação nova a renomear uma que já vendeu.

---

## 8. Arquivar um produto

O botão **Arquivar produto** aparece no fim do formulário de um produto existente. Arquivar
equivale a excluir da vitrine: o produto fica com `is_published=false`, some do site e **não quebra
o histórico de pedidos** que já o incluíram. Ele continua na lista do admin marcado como
"Arquivado" e pode voltar a qualquer momento marcando **Publicado na vitrine** e salvando.

Não existe exclusão definitiva pelo painel — é proposital, para preservar pedidos antigos.

---

## 9. Mensagens de erro comuns

| Mensagem | Causa | Correção |
| --- | --- | --- |
| Informe o nome do produto. | Nome vazio | Preencha o nome |
| Informe um slug/ID valido para o produto. | Nome/slug só com símbolos | Use letras ou números |
| Ja existe um produto com este slug/ID. | Slug repetido | Escolha outro slug |
| Selecione pelo menos uma categoria. | Nenhuma categoria marcada | Marque ao menos uma |
| Familia tecnica invalida. | Valor fora da lista | Recarregue e use o seletor |
| Informe um preco do cliente valido. | Preço vazio, zero ou malformado | Use `199,90` ou `199.90` |
| Informe um preco real valido ou deixe vazio. | Custo malformado | Corrija o valor ou apague o campo |
| Informe pelo menos uma variacao. | Nenhum card preenchido | Preencha o nome de ao menos uma variação |
| Informe o nome de cada variação com estoque preenchido. | Card com estoque mas sem nome | Nomeie a variação |
| A variação X foi informada mais de uma vez. | Nomes repetidos (acento/maiúscula não contam) | Renomeie ou remova o card |
| Estoque inválido para a variação X. | Estoque com letra, vírgula ou negativo | Use inteiro ≥ 0 ou deixe vazio |
| Envie imagens JPG, PNG, WEBP ou GIF. | Formato não suportado | Converta a imagem |
| Cada imagem deve ter no maximo 5MB. | Arquivo grande demais | Comprima antes de enviar |
| Envie no maximo 12 imagens por produto. | Passou do limite | Remova fotos de algum card |
| URL de imagem invalida: … | URL externa malformada | Corrija ou remova a URL |
| Sessao administrativa expirada. | Cookie de admin venceu | Entre de novo em `/entrar?next=/admin` |

---

## 10. Checklists rápidos

**Cadastrar um produto novo**
1. "Adicionar produto" → Nome + Família técnica.
2. Preço do cliente e preço real interno.
3. Marcar as categorias.
4. Um card por variação: nome + estoque + fotos (a primeira é a capa).
5. Notas e **Publicado na vitrine** marcado.
6. Salvar produto.

**Repor estoque**
1. Abrir o produto na lista (recarregue a página antes, para pegar o estoque atual).
2. Ajustar o campo Estoque de cada card.
3. Salvar produto.

**Trocar as fotos**
1. Abrir o produto → no card certo, Remover as fotos antigas.
2. Adicionar fotos → enquadrar em 4:3 → Adicionar ao card.
3. Deixar a capa desejada em primeiro com Anterior/Próxima.
4. Salvar produto (as fotos removidas somem do storage).

**Tirar do ar sem perder histórico**
1. Abrir o produto → desmarcar **Publicado na vitrine** e salvar, ou
2. Usar **Arquivar produto** no fim do formulário.
