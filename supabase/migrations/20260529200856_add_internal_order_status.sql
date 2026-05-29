alter table public.orders
  add column if not exists internal_order_status text
    check (internal_order_status in ('pendente', 'confirmado', 'recusado')),
  add column if not exists internal_order_status_updated_at timestamptz;

create index if not exists orders_internal_order_status_idx
  on public.orders (internal_order_status, created_at desc);
