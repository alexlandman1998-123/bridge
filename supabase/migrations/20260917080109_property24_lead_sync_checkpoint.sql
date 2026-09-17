-- Durable state for the high-frequency Property24 lead pull.  This is
-- service-role-only: it includes operational timestamps, not lead data.
create table if not exists public.property24_lead_sync_checkpoints (
  environment text not null check (environment in ('exdev', 'production')),
  agency_id text not null,
  cursor_after timestamptz,
  lock_token uuid,
  locked_until timestamptz,
  last_started_at timestamptz,
  last_finished_at timestamptz,
  last_status text check (last_status in ('complete', 'failed')),
  last_error text,
  last_received_count integer not null default 0 check (last_received_count >= 0),
  last_imported_count integer not null default 0 check (last_imported_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (environment, agency_id)
);

alter table public.property24_lead_sync_checkpoints enable row level security;
revoke all on public.property24_lead_sync_checkpoints from anon, authenticated;
grant all on public.property24_lead_sync_checkpoints to service_role;

create or replace function public.property24_acquire_lead_sync_lock(
  p_environment text,
  p_agency_id text,
  p_lock_ttl_seconds integer default 240
) returns table (
  acquired boolean,
  cursor_after timestamptz,
  lock_token uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token uuid := gen_random_uuid();
  v_environment text := lower(trim(p_environment));
  v_agency_id text := trim(p_agency_id);
  v_ttl_seconds integer := greatest(60, least(coalesce(p_lock_ttl_seconds, 240), 900));
begin
  if v_environment not in ('exdev', 'production') then
    raise exception 'Unsupported Property24 environment.' using errcode = '22023';
  end if;
  if v_agency_id = '' then
    raise exception 'Property24 agency ID is required.' using errcode = '22023';
  end if;

  insert into public.property24_lead_sync_checkpoints (environment, agency_id, lock_token, locked_until, last_started_at, updated_at)
  values (v_environment, v_agency_id, v_token, now() + make_interval(secs => v_ttl_seconds), now(), now())
  on conflict (environment, agency_id) do update
    set lock_token = excluded.lock_token,
        locked_until = excluded.locked_until,
        last_started_at = excluded.last_started_at,
        updated_at = excluded.updated_at
    where public.property24_lead_sync_checkpoints.locked_until is null
       or public.property24_lead_sync_checkpoints.locked_until < now()
  returning true, property24_lead_sync_checkpoints.cursor_after, property24_lead_sync_checkpoints.lock_token
    into acquired, cursor_after, lock_token;

  if acquired then return next; return; end if;

  select false, checkpoint.cursor_after, null::uuid
    into acquired, cursor_after, lock_token
  from public.property24_lead_sync_checkpoints checkpoint
  where checkpoint.environment = v_environment and checkpoint.agency_id = v_agency_id;
  return next;
end;
$$;

create or replace function public.property24_complete_lead_sync_lock(
  p_environment text,
  p_agency_id text,
  p_lock_token uuid,
  p_status text,
  p_cursor_after timestamptz default null,
  p_received_count integer default 0,
  p_imported_count integer default 0,
  p_error text default null
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text := lower(trim(p_status));
begin
  if v_status not in ('complete', 'failed') then
    raise exception 'Unsupported Property24 lead sync status.' using errcode = '22023';
  end if;
  update public.property24_lead_sync_checkpoints
    set cursor_after = case when v_status = 'complete' then p_cursor_after else cursor_after end,
        lock_token = null,
        locked_until = null,
        last_finished_at = now(),
        last_status = v_status,
        last_error = case when v_status = 'failed' then left(coalesce(p_error, 'Unknown sync failure.'), 1000) else null end,
        last_received_count = greatest(coalesce(p_received_count, 0), 0),
        last_imported_count = greatest(coalesce(p_imported_count, 0), 0),
        updated_at = now()
  where environment = lower(trim(p_environment))
    and agency_id = trim(p_agency_id)
    and lock_token = p_lock_token;
  return found;
end;
$$;

revoke all on function public.property24_acquire_lead_sync_lock(text, text, integer) from public;
revoke all on function public.property24_complete_lead_sync_lock(text, text, uuid, text, timestamptz, integer, integer, text) from public;
grant execute on function public.property24_acquire_lead_sync_lock(text, text, integer) to service_role;
grant execute on function public.property24_complete_lead_sync_lock(text, text, uuid, text, timestamptz, integer, integer, text) to service_role;
