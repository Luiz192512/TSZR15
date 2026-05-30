create table if not exists public.order_item_reviews (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  order_item_id uuid not null references public.order_items(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id text not null,
  product_slug text not null,
  product_name text not null,
  rating integer not null check (rating between 1 and 5),
  comment text not null check (char_length(trim(comment)) between 8 and 1200),
  public_name text not null default 'Cliente TSZR15',
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  moderation_note text,
  moderated_at timestamptz,
  moderated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint order_item_reviews_one_per_item unique (order_item_id),
  constraint order_item_reviews_order_item_match unique (order_id, order_item_id)
);

create table if not exists public.order_review_photos (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.order_item_reviews(id) on delete cascade,
  storage_bucket text not null default 'review-photos',
  storage_path text not null,
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'image/gif')),
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 5242880),
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  constraint order_review_photos_path_unique unique (storage_bucket, storage_path)
);

create index if not exists order_item_reviews_user_created_idx
on public.order_item_reviews (user_id, created_at desc);

create index if not exists order_item_reviews_product_status_idx
on public.order_item_reviews (product_id, status, created_at desc);

create index if not exists order_item_reviews_status_created_idx
on public.order_item_reviews (status, created_at desc);

create index if not exists order_review_photos_review_sort_idx
on public.order_review_photos (review_id, sort_order);

drop trigger if exists order_item_reviews_set_updated_at on public.order_item_reviews;
create trigger order_item_reviews_set_updated_at
before update on public.order_item_reviews
for each row execute function public.set_updated_at();

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
) values (
  'review-photos',
  'review-photos',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

alter table public.order_item_reviews enable row level security;
alter table public.order_review_photos enable row level security;

revoke all on public.order_item_reviews from anon, authenticated;
revoke all on public.order_review_photos from anon, authenticated;

grant select, insert, update on public.order_item_reviews to authenticated;
grant select on public.order_review_photos to authenticated;
grant select, insert, update, delete on public.order_item_reviews to service_role;
grant select, insert, update, delete on public.order_review_photos to service_role;

drop policy if exists "Customers can view own item reviews" on public.order_item_reviews;
create policy "Customers can view own item reviews"
on public.order_item_reviews for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Customers can create delivered item reviews" on public.order_item_reviews;
create policy "Customers can create delivered item reviews"
on public.order_item_reviews for insert
to authenticated
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1
    from public.orders
    join public.order_items on order_items.order_id = orders.id
    where orders.id = order_item_reviews.order_id
      and order_items.id = order_item_reviews.order_item_id
      and orders.user_id = (select auth.uid())
      and orders.operational_status = 'entregue'
      and order_items.product_id = order_item_reviews.product_id
      and order_items.product_slug = order_item_reviews.product_slug
  )
);

drop policy if exists "Customers can update own pending item reviews" on public.order_item_reviews;
create policy "Customers can update own pending item reviews"
on public.order_item_reviews for update
to authenticated
using (
  (select auth.uid()) = user_id
  and status in ('pending', 'rejected')
)
with check (
  (select auth.uid()) = user_id
  and status = 'pending'
  and exists (
    select 1
    from public.orders
    join public.order_items on order_items.order_id = orders.id
    where orders.id = order_item_reviews.order_id
      and order_items.id = order_item_reviews.order_item_id
      and orders.user_id = (select auth.uid())
      and orders.operational_status = 'entregue'
      and order_items.product_id = order_item_reviews.product_id
      and order_items.product_slug = order_item_reviews.product_slug
  )
);

drop policy if exists "Customers can view own review photos" on public.order_review_photos;
create policy "Customers can view own review photos"
on public.order_review_photos for select
to authenticated
using (
  exists (
    select 1
    from public.order_item_reviews
    where order_item_reviews.id = order_review_photos.review_id
      and order_item_reviews.user_id = (select auth.uid())
  )
);
