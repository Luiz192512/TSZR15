# TSZR15

Base de loja Yamaha R15 em `Next.js` com:

- catalogo curado e filtrado para R15
- familias tecnicas e slots do configurador
- tela inicial de catalogo
- inicio do configurador 3D em `react-three-fiber`
- endpoints internos para bootstrap do catalogo e do configurador
- validacao automatica e testes do catalogo

## Rotas

- `/`: vitrine principal com filtros de categoria, busca e destaque de itens 3D
- `/configurador`: workbench inicial do configurador 3D da R15
- `/api/catalog`: JSON do catalogo publicado
- `/api/configurator/bootstrap`: JSON dos slots e produtos do configurador

## Estrutura principal

- `app/`: App Router do Next.js
- `src/catalog/`: regras, categorias, produtos e funcoes de validacao
- `src/components/catalog/`: experiencia de vitrine
- `src/components/configurator/`: painel e cena 3D inicial
- `tests/`: testes de regra de negocio do catalogo

## Scripts

```bash
npm install
npm run dev
npm run build
npm run validate
npm test
```

## Observacoes

- O catalogo publicado mantem apenas itens R15 ou excecoes aprovadas por referencia visual, como `Frente R6` e `Hayabusa Adesivos Japones`.
- O viewer 3D atual usa geometria base para validar fluxo, slots e selecao. O proximo passo natural e substituir os blocos por modelos `GLB` da R15 e dos acessorios.
