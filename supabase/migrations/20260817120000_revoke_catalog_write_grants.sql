-- Mesmo problema de 20260807210000, agora nas tabelas de catalogo: os grants
-- para anon e authenticated sao de tabela inteira e incluem INSERT, UPDATE,
-- DELETE e TRUNCATE. Hoje a escrita e negada porque essas tabelas so tem
-- policy de SELECT — auditoria confirmou em transacao revertida que UPDATE e
-- DELETE afetam 0 linhas e que INSERT devolve 42501. Ou seja: a protecao esta
-- inteira na ausencia de policy, e uma policy de escrita criada por engano no
-- futuro abriria tudo, porque o grant continua concedido.
--
-- O SELECT permanece de proposito: a vitrine publica le catalog_products,
-- catalog_variation_stock e catalog_categories com a chave publishable, e as
-- policies de RLS ja limitam as linhas a produtos publicados.
--
-- As leituras e escritas do admin usam createServiceRoleSupabaseClient(), que
-- ignora RLS e grants, entao nada no app depende do que esta sendo revogado.
begin;

revoke insert, update, delete, truncate on table public.catalog_products from anon, authenticated;
revoke insert, update, delete, truncate on table public.catalog_variation_stock from anon, authenticated;
revoke insert, update, delete, truncate on table public.catalog_categories from anon, authenticated;
revoke insert, update, delete, truncate on table public.catalog_product_categories from anon, authenticated;

commit;
