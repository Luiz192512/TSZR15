create schema if not exists private;

create table if not exists private.api_rate_limits (
  scope text not null,
  identifier_hash text not null,
  window_started_at timestamptz not null default now(),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  blocked_until timestamptz,
  updated_at timestamptz not null default now(),
  primary key (scope, identifier_hash)
);

alter table private.api_rate_limits enable row level security;

revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;

revoke all on table private.api_rate_limits from public, anon, authenticated;
grant select, insert, update, delete on table private.api_rate_limits to service_role;

create index if not exists api_rate_limits_updated_at_idx
  on private.api_rate_limits (updated_at);

create or replace function public.consume_rate_limit(
  p_scope text,
  p_identifier_hash text,
  p_limit integer,
  p_window_seconds integer,
  p_block_seconds integer default null,
  p_increment boolean default true
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_now timestamptz := now();
  v_row private.api_rate_limits%rowtype;
  v_effective_block_seconds integer := coalesce(nullif(p_block_seconds, 0), p_window_seconds);
  v_next_count integer;
  v_retry_after integer := 0;
begin
  if nullif(trim(p_scope), '') is null or nullif(trim(p_identifier_hash), '') is null then
    raise exception 'scope and identifier hash are required';
  end if;

  if p_limit <= 0 or p_window_seconds <= 0 then
    raise exception 'limit and window must be positive';
  end if;

  select *
    into v_row
    from private.api_rate_limits
   where scope = p_scope
     and identifier_hash = p_identifier_hash
   for update;

  if not found
    or v_row.window_started_at <= v_now - make_interval(secs => p_window_seconds)
  then
    if not p_increment then
      return jsonb_build_object(
        'allowed', true,
        'count', 0,
        'limit', p_limit,
        'remaining', p_limit,
        'retryAfterSeconds', 0
      );
    end if;

    insert into private.api_rate_limits (
      scope,
      identifier_hash,
      window_started_at,
      attempt_count,
      blocked_until,
      updated_at
    )
    values (
      p_scope,
      p_identifier_hash,
      v_now,
      1,
      null,
      v_now
    )
    on conflict (scope, identifier_hash)
    do update set
      window_started_at = excluded.window_started_at,
      attempt_count = excluded.attempt_count,
      blocked_until = excluded.blocked_until,
      updated_at = excluded.updated_at;

    return jsonb_build_object(
      'allowed', true,
      'count', 1,
      'limit', p_limit,
      'remaining', greatest(p_limit - 1, 0),
      'retryAfterSeconds', 0
    );
  end if;

  if v_row.blocked_until is not null and v_row.blocked_until > v_now then
    v_retry_after := greatest(ceil(extract(epoch from (v_row.blocked_until - v_now)))::integer, 1);

    return jsonb_build_object(
      'allowed', false,
      'count', v_row.attempt_count,
      'limit', p_limit,
      'remaining', 0,
      'retryAfterSeconds', v_retry_after
    );
  end if;

  if not p_increment then
    return jsonb_build_object(
      'allowed', true,
      'count', v_row.attempt_count,
      'limit', p_limit,
      'remaining', greatest(p_limit - v_row.attempt_count, 0),
      'retryAfterSeconds', 0
    );
  end if;

  v_next_count := v_row.attempt_count + 1;

  if v_next_count > p_limit then
    update private.api_rate_limits
       set attempt_count = v_next_count,
           blocked_until = v_now + make_interval(secs => v_effective_block_seconds),
           updated_at = v_now
     where scope = p_scope
       and identifier_hash = p_identifier_hash;

    return jsonb_build_object(
      'allowed', false,
      'count', v_next_count,
      'limit', p_limit,
      'remaining', 0,
      'retryAfterSeconds', v_effective_block_seconds
    );
  end if;

  update private.api_rate_limits
     set attempt_count = v_next_count,
         blocked_until = null,
         updated_at = v_now
   where scope = p_scope
     and identifier_hash = p_identifier_hash;

  return jsonb_build_object(
    'allowed', true,
    'count', v_next_count,
    'limit', p_limit,
    'remaining', greatest(p_limit - v_next_count, 0),
    'retryAfterSeconds', 0
  );
end;
$$;

revoke all on function public.consume_rate_limit(text, text, integer, integer, integer, boolean)
  from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text, text, integer, integer, integer, boolean)
  to service_role;

create or replace function public.reset_rate_limit(
  p_scope text,
  p_identifier_hash text
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  delete from private.api_rate_limits
   where scope = p_scope
     and identifier_hash = p_identifier_hash;
end;
$$;

revoke all on function public.reset_rate_limit(text, text)
  from public, anon, authenticated;
grant execute on function public.reset_rate_limit(text, text)
  to service_role;
