# Design QA — cards vinculados de variações

## Evidências

- Verdade visual anterior: `C:/Users/forti/AppData/Local/Temp/tszr15-variation-single-field/desktop.png`
- Implementação desktop: `C:/Users/forti/AppData/Local/Temp/tszr15-variation-cards/desktop.png`
- Implementação mobile: `C:/Users/forti/AppData/Local/Temp/tszr15-variation-cards/mobile.png`
- Região focada dos campos mobile: `C:/Users/forti/AppData/Local/Temp/tszr15-variation-cards/mobile-fields.png`
- Comparação conjunta: `C:/Users/forti/AppData/Local/Temp/tszr15-variation-cards/source-vs-cards.png`
- Viewports: desktop 1280 × 720 e mobile 390 × 844.
- Estado: produto Ponteira estilo SC com uma nova variação `Fumê`, estoque `6`, movida para a primeira posição sem salvar no banco.

## Superfícies verificadas

- Tipografia: pesos, caixa alta, hierarquia e tamanhos seguem o painel TSZR15 existente.
- Espaçamento e ritmo: cabeçalho, campos, ações e galerias permanecem legíveis; no mobile os controles passam para uma coluna.
- Cores e tokens: vermelho, preto, bordas e estados desabilitados reutilizam os tokens atuais.
- Imagens: as fotos reais do produto permanecem nítidas em 4:3; a primeira recebe o rótulo de capa da variação.
- Conteúdo: nome, estoque, fotos e instruções aparecem no mesmo card e deixam claro o efeito da reordenação.

## Interações verificadas

- Adicionar uma variação.
- Editar nome e estoque.
- Mover o card e confirmar que seu estado serializado muda junto.
- Preservar as três fotos existentes no card legado.
- Confirmar ausência de overflow horizontal no viewport mobile.
- Verificar o console local sem erros originados pela aplicação.

## Comparação e histórico

- Iteração 1 — P2: os inputs nativos de arquivo ainda apareciam como botões sem nome na árvore de acessibilidade. Correção: ficaram `hidden`, `aria-hidden` e fora da ordem de tabulação; a nova captura não apresenta esses controles.
- Iteração final: nenhuma diferença P0, P1 ou P2 permanece. A mudança estrutural em relação ao textarea é intencional e mantém a mesma linguagem visual do painel.
- A comparação completa foi suficiente para composição e densidade; a captura `mobile-fields.png` foi usada como região focada para legibilidade, campos e ações.

final result: passed
