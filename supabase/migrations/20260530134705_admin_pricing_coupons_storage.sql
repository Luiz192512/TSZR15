create table if not exists public.catalog_product_costs (
  product_id text primary key references public.catalog_products(id) on delete cascade,
  cost_cents integer not null check (cost_cents >= 0),
  currency text not null default 'BRL',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint catalog_product_costs_currency_check check (currency = 'BRL')
);

create table if not exists public.catalog_coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  description text not null default '',
  discount_type text not null default 'percent',
  discount_percent integer,
  discount_cents integer,
  minimum_subtotal_cents integer not null default 0 check (minimum_subtotal_cents >= 0),
  applies_to_product_ids text[] not null default '{}',
  applies_to_category_ids text[] not null default '{}',
  starts_at timestamptz,
  expires_at timestamptz,
  max_redemptions integer check (max_redemptions is null or max_redemptions > 0),
  redemption_count integer not null default 0 check (redemption_count >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint catalog_coupons_code_format_check check (code = upper(code) and code ~ '^[A-Z0-9_-]{3,40}$'),
  constraint catalog_coupons_discount_type_check check (discount_type in ('percent', 'fixed')),
  constraint catalog_coupons_discount_value_check check (
    (
      discount_type = 'percent'
      and discount_percent between 1 and 100
      and discount_cents is null
    )
    or
    (
      discount_type = 'fixed'
      and discount_cents > 0
      and discount_percent is null
    )
  ),
  constraint catalog_coupons_dates_check check (expires_at is null or starts_at is null or expires_at > starts_at)
);

create index if not exists catalog_coupons_active_code_idx
on public.catalog_coupons (code, is_active);

create index if not exists catalog_coupons_product_ids_idx
on public.catalog_coupons using gin(applies_to_product_ids);

create index if not exists catalog_coupons_category_ids_idx
on public.catalog_coupons using gin(applies_to_category_ids);

drop trigger if exists catalog_product_costs_set_updated_at on public.catalog_product_costs;
create trigger catalog_product_costs_set_updated_at
before update on public.catalog_product_costs
for each row execute function public.set_updated_at();

drop trigger if exists catalog_coupons_set_updated_at on public.catalog_coupons;
create trigger catalog_coupons_set_updated_at
before update on public.catalog_coupons
for each row execute function public.set_updated_at();

alter table public.catalog_product_costs enable row level security;
alter table public.catalog_coupons enable row level security;

revoke all on public.catalog_product_costs from anon, authenticated;
revoke all on public.catalog_coupons from anon, authenticated;
grant select, insert, update, delete on public.catalog_product_costs to service_role;
grant select, insert, update, delete on public.catalog_coupons to service_role;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
) values (
  'product-images',
  'product-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

alter table public.orders
  add column if not exists discount_snapshot jsonb not null default '{}'::jsonb;

alter table public.order_items
  add column if not exists unit_cost_cents integer check (unit_cost_cents is null or unit_cost_cents >= 0),
  add column if not exists subtotal_cost_cents integer check (subtotal_cost_cents is null or subtotal_cost_cents >= 0);

create or replace function public.redeem_catalog_coupon(p_code text)
returns void
language plpgsql
as $$
declare
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Z0-9_-]', '', 'g'));
begin
  if v_code = '' then
    return;
  end if;

  update public.catalog_coupons
  set redemption_count = redemption_count + 1
  where code = v_code
    and is_active = true
    and (starts_at is null or starts_at <= now())
    and (expires_at is null or expires_at >= now())
    and (max_redemptions is null or redemption_count < max_redemptions);
end;
$$;

revoke all on function public.redeem_catalog_coupon(text) from public;
grant execute on function public.redeem_catalog_coupon(text) to service_role;

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
    discount_snapshot,
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
    coalesce(p_totals -> 'discountSnapshot', '{}'::jsonb),
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
      unit_cost_cents,
      quantity,
      subtotal_cents,
      subtotal_cost_cents,
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
      nullif(v_item ->> 'unitCostCents', '')::integer,
      (v_item ->> 'quantity')::integer,
      (v_item ->> 'subtotalCents')::integer,
      nullif(v_item ->> 'subtotalCostCents', '')::integer,
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
      'couponCode', nullif(p_totals #>> '{discountSnapshot,code}', ''),
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
