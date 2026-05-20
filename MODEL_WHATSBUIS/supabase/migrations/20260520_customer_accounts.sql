create table if not exists public.customer_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  tax_id text,
  email text not null default '',
  whatsapp text not null default '',
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.customer_addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null default 'Principal',
  is_default boolean not null default true,
  cep text not null,
  street text not null,
  number text not null,
  district text not null,
  city text not null,
  state text not null,
  complement text,
  reference_point text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.assisted_purchase_consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  consent_version text not null,
  consent_text text not null,
  purchase_data_use_authorized boolean not null default false,
  ip_address inet,
  user_agent text,
  accepted_at timestamptz not null default now()
);

create index if not exists customer_addresses_user_default_idx
  on public.customer_addresses (user_id, is_default);

create index if not exists assisted_purchase_consents_user_idx
  on public.assisted_purchase_consents (user_id, accepted_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists customer_profiles_set_updated_at on public.customer_profiles;
create trigger customer_profiles_set_updated_at
before update on public.customer_profiles
for each row execute function public.set_updated_at();

drop trigger if exists customer_addresses_set_updated_at on public.customer_addresses;
create trigger customer_addresses_set_updated_at
before update on public.customer_addresses
for each row execute function public.set_updated_at();

create or replace function public.handle_new_customer_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.customer_profiles (
    user_id,
    full_name,
    tax_id,
    email,
    whatsapp,
    phone
  )
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'tax_id', ''),
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'whatsapp', ''),
    nullif(new.raw_user_meta_data ->> 'phone', '')
  )
  on conflict (user_id) do update
  set
    full_name = excluded.full_name,
    tax_id = excluded.tax_id,
    email = excluded.email,
    whatsapp = excluded.whatsapp,
    phone = excluded.phone,
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_customer_profile on auth.users;
create trigger on_auth_user_created_customer_profile
after insert on auth.users
for each row execute function public.handle_new_customer_profile();

alter table public.customer_profiles enable row level security;
alter table public.customer_addresses enable row level security;
alter table public.assisted_purchase_consents enable row level security;

drop policy if exists "Customers can view own profile" on public.customer_profiles;
create policy "Customers can view own profile"
on public.customer_profiles for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Customers can insert own profile" on public.customer_profiles;
create policy "Customers can insert own profile"
on public.customer_profiles for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Customers can update own profile" on public.customer_profiles;
create policy "Customers can update own profile"
on public.customer_profiles for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Customers can view own addresses" on public.customer_addresses;
create policy "Customers can view own addresses"
on public.customer_addresses for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Customers can insert own addresses" on public.customer_addresses;
create policy "Customers can insert own addresses"
on public.customer_addresses for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Customers can update own addresses" on public.customer_addresses;
create policy "Customers can update own addresses"
on public.customer_addresses for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Customers can view own consents" on public.assisted_purchase_consents;
create policy "Customers can view own consents"
on public.assisted_purchase_consents for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Customers can insert own consents" on public.assisted_purchase_consents;
create policy "Customers can insert own consents"
on public.assisted_purchase_consents for insert
to authenticated
with check ((select auth.uid()) = user_id);

create or replace function public.generate_order_number()
returns text
language sql
as $$
  select 'TSZ-' ||
    to_char(now() at time zone 'America/Sao_Paulo', 'YYYYMMDD') ||
    '-' ||
    upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
$$;

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique default public.generate_order_number(),
  user_id uuid references auth.users(id) on delete set null,
  customer_name text not null,
  customer_email text,
  customer_whatsapp text,
  customer_phone text,
  customer_tax_id text,
  customer_snapshot jsonb not null default '{}'::jsonb,
  address_snapshot jsonb not null default '{}'::jsonb,
  subtotal_cents integer not null default 0 check (subtotal_cents >= 0),
  discount_cents integer not null default 0 check (discount_cents >= 0),
  shipping_cents integer not null default 0 check (shipping_cents >= 0),
  total_cents integer not null default 0 check (total_cents >= 0),
  currency text not null default 'BRL',
  shipping_option_id text not null,
  shipping_label text not null,
  shipping_eta text,
  payment_method_id text not null,
  payment_method_label text not null,
  payment_status text not null default 'aguardando_pagamento'
    check (payment_status in (
      'aguardando_pagamento',
      'pagamento_confirmado',
      'cancelado',
      'reembolsado'
    )),
  operational_status text not null default 'enviado_whatsapp_business'
    check (operational_status in (
      'orcamento_iniciado',
      'enviado_whatsapp_business',
      'aguardando_atendimento',
      'dados_incompletos',
      'aguardando_pagamento',
      'pagamento_confirmado',
      'origem_interna_em_validacao',
      'compra_interna_pendente',
      'compra_interna_realizada',
      'aguardando_postagem_envio',
      'rastreio_recebido',
      'em_transito',
      'saiu_para_entrega',
      'entregue',
      'problema_origem_interna',
      'problema_envio',
      'cancelado',
      'reembolsado'
    )),
  attendance_channel text not null default 'whatsapp-business',
  original_message text not null,
  assisted_purchase_consent_id uuid references public.assisted_purchase_consents(id) on delete set null,
  consent_snapshot jsonb not null default '{}'::jsonb,
  customer_notes text,
  internal_notes text,
  assigned_operator text,
  source_visibility text not null default 'internal_only'
    check (source_visibility = 'internal_only'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id text not null,
  product_slug text not null,
  product_name text not null,
  variation text not null,
  product_family text not null,
  unit_price_cents integer not null check (unit_price_cents >= 0),
  quantity integer not null check (quantity > 0),
  subtotal_cents integer not null check (subtotal_cents >= 0),
  currency text not null default 'BRL',
  storefront_category_ids text[] not null default '{}',
  bike_model_scope text[] not null default '{}',
  checkout_channel text not null default 'whatsapp-business',
  internal_purchase_source jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  provider text not null default 'manual',
  payment_method_id text not null,
  amount_cents integer not null check (amount_cents >= 0),
  currency text not null default 'BRL',
  status text not null default 'aguardando_pagamento'
    check (status in (
      'aguardando_pagamento',
      'pagamento_confirmado',
      'cancelado',
      'reembolsado'
    )),
  provider_reference text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.supplier_purchases (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  internal_channel text
    check (internal_channel in ('shopee', 'aliexpress', 'fornecedor_homologado', 'outro')),
  source_product_url text,
  source_store_name text,
  source_order_number text,
  operational_account text,
  product_cost_cents integer check (product_cost_cents is null or product_cost_cents >= 0),
  shipping_cost_cents integer check (shipping_cost_cents is null or shipping_cost_cents >= 0),
  currency text not null default 'BRL',
  exchange_rate numeric(12, 6),
  purchased_at timestamptz,
  source_eta text,
  tracking_code text,
  carrier text,
  proof_url text,
  source_status text not null default 'nao_comprado',
  internal_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.supplier_tracking_events (
  id uuid primary key default gen_random_uuid(),
  supplier_purchase_id uuid references public.supplier_purchases(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  event_status text not null,
  event_at timestamptz,
  location text,
  description text,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.support_threads (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  issue_type text not null,
  status text not null default 'aberto',
  customer_visible_summary text,
  internal_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  order_id uuid references public.orders(id) on delete set null,
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists orders_user_created_idx
  on public.orders (user_id, created_at desc);

create index if not exists orders_operational_status_idx
  on public.orders (operational_status, created_at desc);

create index if not exists order_items_order_idx
  on public.order_items (order_id);

create index if not exists payments_order_idx
  on public.payments (order_id);

create index if not exists supplier_purchases_order_idx
  on public.supplier_purchases (order_id);

create index if not exists supplier_tracking_events_order_idx
  on public.supplier_tracking_events (order_id, event_at desc);

create index if not exists support_threads_order_idx
  on public.support_threads (order_id, created_at desc);

create index if not exists audit_logs_order_idx
  on public.audit_logs (order_id, created_at desc);

drop trigger if exists orders_set_updated_at on public.orders;
create trigger orders_set_updated_at
before update on public.orders
for each row execute function public.set_updated_at();

drop trigger if exists payments_set_updated_at on public.payments;
create trigger payments_set_updated_at
before update on public.payments
for each row execute function public.set_updated_at();

drop trigger if exists supplier_purchases_set_updated_at on public.supplier_purchases;
create trigger supplier_purchases_set_updated_at
before update on public.supplier_purchases
for each row execute function public.set_updated_at();

drop trigger if exists support_threads_set_updated_at on public.support_threads;
create trigger support_threads_set_updated_at
before update on public.support_threads
for each row execute function public.set_updated_at();

alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.payments enable row level security;
alter table public.supplier_purchases enable row level security;
alter table public.supplier_tracking_events enable row level security;
alter table public.support_threads enable row level security;
alter table public.audit_logs enable row level security;

drop policy if exists "Customers can view own orders" on public.orders;
create policy "Customers can view own orders"
on public.orders for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Customers can create own orders" on public.orders;
create policy "Customers can create own orders"
on public.orders for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Customers can view own order items" on public.order_items;
create policy "Customers can view own order items"
on public.order_items for select
to authenticated
using (
  exists (
    select 1
    from public.orders
    where orders.id = order_items.order_id
      and orders.user_id = (select auth.uid())
  )
);

drop policy if exists "Customers can create own order items" on public.order_items;
create policy "Customers can create own order items"
on public.order_items for insert
to authenticated
with check (
  exists (
    select 1
    from public.orders
    where orders.id = order_items.order_id
      and orders.user_id = (select auth.uid())
  )
);

drop policy if exists "Customers can view own payments" on public.payments;
create policy "Customers can view own payments"
on public.payments for select
to authenticated
using (
  exists (
    select 1
    from public.orders
    where orders.id = payments.order_id
      and orders.user_id = (select auth.uid())
  )
);

drop policy if exists "Customers can create own pending payments" on public.payments;
create policy "Customers can create own pending payments"
on public.payments for insert
to authenticated
with check (
  exists (
    select 1
    from public.orders
    where orders.id = payments.order_id
      and orders.user_id = (select auth.uid())
  )
);

drop policy if exists "Customers can create checkout audit logs" on public.audit_logs;
create policy "Customers can create checkout audit logs"
on public.audit_logs for insert
to authenticated
with check ((select auth.uid()) = actor_user_id);

create or replace function public.create_checkout_order(
  p_user_id uuid,
  p_customer_snapshot jsonb,
  p_address_snapshot jsonb,
  p_items jsonb,
  p_totals jsonb,
  p_payment jsonb,
  p_shipping jsonb,
  p_message text,
  p_consent_snapshot jsonb,
  p_request_context jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_consent_id uuid := null;
  v_item jsonb;
  v_order_id uuid;
  v_order_number text;
begin
  if p_user_id is null and v_auth_user_id is not null then
    p_user_id := v_auth_user_id;
  end if;

  if p_user_id is not null and v_auth_user_id is not null and p_user_id <> v_auth_user_id then
    raise exception 'Nao e permitido criar pedido para outro usuario.';
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Pedido sem itens.';
  end if;

  if p_user_id is not null and coalesce((p_consent_snapshot ->> 'accepted')::boolean, false) then
    insert into public.assisted_purchase_consents (
      user_id,
      consent_version,
      consent_text,
      purchase_data_use_authorized,
      ip_address,
      user_agent
    )
    values (
      p_user_id,
      p_consent_snapshot ->> 'consentVersion',
      p_consent_snapshot ->> 'consentText',
      true,
      nullif(p_request_context ->> 'ipAddress', '')::inet,
      nullif(p_request_context ->> 'userAgent', '')
    )
    returning id into v_consent_id;
  end if;

  insert into public.orders (
    user_id,
    customer_name,
    customer_email,
    customer_whatsapp,
    customer_phone,
    customer_tax_id,
    customer_snapshot,
    address_snapshot,
    subtotal_cents,
    discount_cents,
    shipping_cents,
    total_cents,
    currency,
    shipping_option_id,
    shipping_label,
    shipping_eta,
    payment_method_id,
    payment_method_label,
    payment_status,
    operational_status,
    attendance_channel,
    original_message,
    assisted_purchase_consent_id,
    consent_snapshot,
    customer_notes
  )
  values (
    p_user_id,
    p_customer_snapshot ->> 'name',
    nullif(p_customer_snapshot ->> 'email', ''),
    nullif(p_customer_snapshot ->> 'whatsapp', ''),
    nullif(p_customer_snapshot ->> 'phone', ''),
    nullif(p_customer_snapshot ->> 'taxId', ''),
    p_customer_snapshot,
    p_address_snapshot,
    (p_totals ->> 'subtotalCents')::integer,
    (p_totals ->> 'discountCents')::integer,
    (p_totals ->> 'shippingCents')::integer,
    (p_totals ->> 'totalCents')::integer,
    coalesce(nullif(p_totals ->> 'currency', ''), 'BRL'),
    p_shipping ->> 'id',
    p_shipping ->> 'label',
    nullif(p_shipping ->> 'eta', ''),
    p_payment ->> 'id',
    p_payment ->> 'label',
    coalesce(nullif(p_payment ->> 'status', ''), 'aguardando_pagamento'),
    'enviado_whatsapp_business',
    'whatsapp-business',
    p_message,
    v_consent_id,
    p_consent_snapshot,
    nullif(p_customer_snapshot ->> 'notes', '')
  )
  returning id, order_number into v_order_id, v_order_number;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    insert into public.order_items (
      order_id,
      product_id,
      product_slug,
      product_name,
      variation,
      product_family,
      unit_price_cents,
      quantity,
      subtotal_cents,
      currency,
      storefront_category_ids,
      bike_model_scope,
      checkout_channel,
      internal_purchase_source
    )
    values (
      v_order_id,
      v_item ->> 'productId',
      v_item ->> 'productSlug',
      v_item ->> 'name',
      v_item ->> 'variation',
      v_item ->> 'productFamily',
      (v_item ->> 'unitPriceCents')::integer,
      (v_item ->> 'quantity')::integer,
      (v_item ->> 'subtotalCents')::integer,
      coalesce(nullif(v_item ->> 'currency', ''), 'BRL'),
      coalesce(
        array(select jsonb_array_elements_text(v_item -> 'storefrontCategoryIds')),
        '{}'
      ),
      coalesce(
        array(select jsonb_array_elements_text(v_item -> 'bikeModelScope')),
        '{}'
      ),
      coalesce(nullif(v_item ->> 'checkoutChannel', ''), 'whatsapp-business'),
      coalesce(v_item -> 'internalPurchaseSource', '{}'::jsonb)
    );
  end loop;

  insert into public.payments (
    order_id,
    provider,
    payment_method_id,
    amount_cents,
    currency,
    status
  )
  values (
    v_order_id,
    'manual',
    p_payment ->> 'id',
    (p_totals ->> 'totalCents')::integer,
    coalesce(nullif(p_totals ->> 'currency', ''), 'BRL'),
    coalesce(nullif(p_payment ->> 'status', ''), 'aguardando_pagamento')
  );

  insert into public.audit_logs (
    actor_user_id,
    order_id,
    action,
    metadata
  )
  values (
    p_user_id,
    v_order_id,
    'checkout_order_created',
    jsonb_build_object(
      'attendanceChannel', 'whatsapp-business',
      'operationalStatus', 'enviado_whatsapp_business',
      'paymentStatus', coalesce(nullif(p_payment ->> 'status', ''), 'aguardando_pagamento')
    )
  );

  return jsonb_build_object(
    'id', v_order_id,
    'orderNumber', v_order_number,
    'operationalStatus', 'enviado_whatsapp_business',
    'paymentStatus', coalesce(nullif(p_payment ->> 'status', ''), 'aguardando_pagamento')
  );
end;
$$;

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
