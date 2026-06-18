create index if not exists audit_logs_actor_user_id_idx
  on public.audit_logs (actor_user_id);

create index if not exists orders_assisted_purchase_consent_id_idx
  on public.orders (assisted_purchase_consent_id);

create index if not exists supplier_tracking_events_supplier_purchase_id_idx
  on public.supplier_tracking_events (supplier_purchase_id);
