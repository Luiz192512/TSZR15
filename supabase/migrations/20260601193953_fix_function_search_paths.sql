-- Lock function search_path so Security Advisor no longer treats these RPCs as role mutable.

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
set search_path = '';

alter function public.redeem_catalog_coupon(text)
set search_path = '';
