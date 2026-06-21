create table if not exists public.customer_carts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  items jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_carts_items_array check (jsonb_typeof(items) = 'array')
);

alter table public.customer_carts enable row level security;

grant select, insert, update, delete on public.customer_carts to authenticated;

drop policy if exists "Customers can view own cart" on public.customer_carts;
create policy "Customers can view own cart"
on public.customer_carts for select to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists "Customers can create own cart" on public.customer_carts;
create policy "Customers can create own cart"
on public.customer_carts for insert to authenticated
with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists "Customers can update own cart" on public.customer_carts;
create policy "Customers can update own cart"
on public.customer_carts for update to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id)
with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists "Customers can delete own cart" on public.customer_carts;
create policy "Customers can delete own cart"
on public.customer_carts for delete to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop trigger if exists customer_carts_set_updated_at on public.customer_carts;
create trigger customer_carts_set_updated_at
before update on public.customer_carts
for each row execute function public.set_updated_at();
