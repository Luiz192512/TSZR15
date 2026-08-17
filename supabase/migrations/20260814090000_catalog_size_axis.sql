-- Eixo de tamanho (grade de vestuario) + categoria de vitrine "vestuario".
--
-- Aditiva e retrocompativel por construcao: toda linha existente fica com
-- size = '' (produto sem grade), que e o caso de todo o catalogo de acessorios.
-- O codigo publicado hoje nao le nem escreve as colunas novas, entao esta
-- migracao pode ser aplicada antes do deploy sem janela de indisponibilidade.
--
-- ORDEM OBRIGATORIA: aplicar esta migracao, depois publicar as RPCs com suporte
-- a size (fase seguinte) e so entao liberar o cadastro de tamanhos no admin.
-- Enquanto reserve_order_stock/release_order_stock agruparem apenas por
-- (product_id, variation), duas linhas de estoque do mesmo par com sizes
-- diferentes fariam o lock pegar uma linha arbitraria.
begin;

-- Grade publicada do produto. Vazio = produto sem tamanho (comportamento atual).
alter table public.catalog_products
  add column if not exists size_options text[] not null default '{}';

-- Estoque passa a ser por (variacao, tamanho). '' = linha sem grade.
alter table public.catalog_variation_stock
  add column if not exists size text not null default '';

alter table public.catalog_variation_stock
  drop constraint if exists catalog_variation_stock_pkey;

alter table public.catalog_variation_stock
  add constraint catalog_variation_stock_pkey
  primary key (product_id, variation, size);

-- Snapshot do tamanho comprado. order_items segue sem grant para anon e
-- authenticated (20260807210000), entao a coluna nasce fechada.
alter table public.order_items
  add column if not exists size text not null default '';

-- Categoria de vitrine usada pelo script de sync (FK de catalog_product_categories).
insert into public.catalog_categories (id, label, slug, sort_order, is_visible)
values ('vestuario', 'Vestuário', 'vestuario', 6, true)
on conflict (id) do nothing;

commit;
