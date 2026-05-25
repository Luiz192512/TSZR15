-- Supabase Security Advisor hardening for existing functions and internal tables.

alter function public.set_updated_at()
set search_path = public, pg_temp;

alter function public.generate_order_number()
set search_path = public, pg_temp;

alter function public.handle_new_customer_profile()
set search_path = public, pg_temp;

alter function public.create_checkout_order(
  uuid,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  text,
  jsonb,
  jsonb
)
set search_path = public, pg_temp;

revoke all on function public.handle_new_customer_profile() from public;
revoke all on function public.handle_new_customer_profile() from anon;
revoke all on function public.handle_new_customer_profile() from authenticated;
grant execute on function public.handle_new_customer_profile() to service_role;

revoke all on function public.create_checkout_order(
  uuid,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  text,
  jsonb,
  jsonb
) from public;

revoke all on function public.create_checkout_order(
  uuid,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  text,
  jsonb,
  jsonb
) from anon;

grant execute on function public.create_checkout_order(
  uuid,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  text,
  jsonb,
  jsonb
) to authenticated, service_role;

drop policy if exists "No direct client access to supplier purchases"
on public.supplier_purchases;
create policy "No direct client access to supplier purchases"
on public.supplier_purchases
for all
to anon, authenticated
using (false)
with check (false);

drop policy if exists "No direct client access to supplier tracking events"
on public.supplier_tracking_events;
create policy "No direct client access to supplier tracking events"
on public.supplier_tracking_events
for all
to anon, authenticated
using (false)
with check (false);

drop policy if exists "No direct client access to support threads"
on public.support_threads;
create policy "No direct client access to support threads"
on public.support_threads
for all
to anon, authenticated
using (false)
with check (false);
