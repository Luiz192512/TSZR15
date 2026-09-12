-- Tira o dinheiro de dentro da coluna que o catalogo publico expoe.
--
-- `catalog_products` libera `select` para `anon` DE PROPOSITO — e o catalogo da
-- loja. A coluna `internal_purchase_source` ia junto, e em 6 dos 17 produtos
-- publicados ela carregava `marginCents`: a margem de lucro, legivel por
-- qualquer visitante com a chave publicavel, que viaja no proprio pacote da
-- loja.
--
-- `toPublicCatalogProduct` (src/catalog/index.js) ja removia esse campo antes de
-- mandar ao navegador. Quem chamasse o PostgREST direto pulava a limpeza.
--
-- Por que APAGAR e nao mover para a tabela protegida:
--   - `marginCents` era exatamente `price_cents - cost_cents` nos 6 produtos;
--   - nenhum codigo lia a chave — o admin calcula `marginPercent` a partir de
--     `catalog_product_costs` (src/admin/catalog-admin.js);
--   - o painel nao grava mais esse campo: `catalog-admin.js` escreve apenas
--     `importMode`, `provider`, `sourceCategoryIds` e `visibility`.
-- Era dado morto e duplicado, vindo de um lote manual antigo.
--
-- `shipping` sai junto pelo mesmo motivo: guardava valor em reais
-- ("R$ 24,00") do calculo de custo daquele lote, ninguem le, e a coluna e
-- publica. O frete que o cliente ve vem de `shipping_class`, coluna propria.
--
-- `source` fica: e rotulo de procedencia da importacao, sem segredo dentro.

update public.catalog_products
set internal_purchase_source = internal_purchase_source - 'marginCents' - 'shipping'
where internal_purchase_source ?| array['marginCents', 'shipping'];
