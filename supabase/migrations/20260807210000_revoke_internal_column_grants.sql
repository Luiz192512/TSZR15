-- As policies de RLS filtram LINHA, nao COLUNA, e os grants eram de tabela
-- inteira para anon e authenticated. Resultado: um cliente logado conseguia
-- pedir qualquer coluna do proprio pedido direto no PostgREST, contornando as
-- projecoes explicitas da aplicacao — inclusive order_items.unit_cost_cents e
-- order_items.subtotal_cost_cents, que revelam a margem da loja, e
-- orders.internal_notes, onde o operador escreve observacoes internas.
--
-- Nenhum codigo do app depende desse caminho: todas as leituras dessas tabelas
-- usam createServiceRoleSupabaseClient(), que ignora RLS e grants, e nenhum
-- componente de navegador as consulta. Revogar tudo faz colunas novas nascerem
-- fechadas por padrao, que e o padrao ja adotado em catalog_product_costs.
--
-- As policies permanecem de proposito: se um grant for reintroduzido no futuro,
-- elas ainda limitam as linhas.
revoke all on table public.orders from anon, authenticated;
revoke all on table public.order_items from anon, authenticated;
revoke all on table public.payments from anon, authenticated;
revoke all on table public.supplier_purchases from anon, authenticated;
revoke all on table public.supplier_tracking_events from anon, authenticated;
revoke all on table public.audit_logs from anon, authenticated;
revoke all on table public.support_threads from anon, authenticated;
