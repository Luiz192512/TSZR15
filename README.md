# TSZR15

Base de loja Yamaha R15 em `Next.js`, agora planejada como e-commerce operacional antes de experiencia 3D, com:

- catalogo curado e filtrado para R15
- familias tecnicas para compatibilidade, filtros e evolucao futura
- tela inicial de catalogo
- prototipo de configurador 3D em `react-three-fiber`, fora do caminho critico do MVP
- endpoints internos para bootstrap do catalogo e do configurador
- validacao automatica e testes do catalogo
- planejamento de cadastro, endereco, frete, checkout, rastreio, dashboard financeiro, avaliacao e suporte

## Rotas

- `/`: vitrine principal com filtros de categoria, busca e destaque de itens 3D
- `/configurador`: prototipo inicial do configurador 3D da R15, mantido como experimento opcional
- `/api/catalog`: JSON do catalogo publicado
- `/api/configurator/bootstrap`: JSON dos slots e produtos do configurador

## Planejamento atual

O plano completo esta em [`PLAN.md`](PLAN.md). A prioridade do MVP mudou para:

- cadastro de cliente com dados de entrega e emissao fiscal
- cadastro de endereco para calculo de frete
- carrinho, resumo de compra e fechamento de pedido
- frete pago integral ou frete gratis por regra comercial
- acompanhamento de pedido com status, previsao e codigo de rastreio
- dashboard financeiro para usuario admin
- suporte e avaliacao de produto

O configurador 3D deve ser tratado como fase opcional. Antes de investir em modelos `GLB`, o projeto precisa validar venda, margem, frete, suporte e operacao.

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
- O viewer 3D atual usa geometria base para validar fluxo, slots e selecao, mas nao e prioridade financeira do MVP.
- O proximo ciclo de produto deve atacar fluxo de compra, pedido, frete, rastreio, fiscal, dashboard admin e suporte.
