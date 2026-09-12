begin;

-- A single reservation ledger is the authoritative cross-worker daily quota.
-- It is deliberately keyed by a delivery identity, making retries idempotent.
create table if not exists public.email_delivery_reservations (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  delivery_key text not null unique,
  delivery_kind text not null check (delivery_kind in ('campaign', 'automation')),
  reserved_for date not null default (now() at time zone 'UTC')::date,
  status text not null default 'reserved' check (status in ('reserved', 'sent', 'released')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  released_at timestamptz
);
create index if not exists email_delivery_reservations_org_day_idx on public.email_delivery_reservations (organisation_id, reserved_for, status);
alter table public.email_delivery_reservations enable row level security;
-- No browser role needs access: service-role-only workers own quota mutation.

alter table public.email_campaign_recipients
  add column if not exists next_attempt_at timestamptz not null default now(),
  add column if not exists locked_at timestamptz;
create index if not exists email_campaign_recipients_due_idx on public.email_campaign_recipients (campaign_id, next_attempt_at, created_at) where status = 'queued';

create or replace function public.email_delivery_reserve_quota(
  p_organisation_id uuid, p_delivery_key text, p_delivery_kind text
) returns boolean language plpgsql security definer set search_path = public as $$
declare v_limit integer; v_used integer;
begin
  perform pg_advisory_xact_lock(hashtext(p_organisation_id::text));
  select daily_recipient_limit into v_limit from public.email_sending_policies where organisation_id = p_organisation_id;
  v_limit := coalesce(v_limit, 500);
  update public.email_delivery_reservations set status = 'released', released_at = now()
  where organisation_id = p_organisation_id and status = 'reserved' and expires_at < now();
  if exists (select 1 from public.email_delivery_reservations where delivery_key = p_delivery_key and status in ('reserved', 'sent')) then return true; end if;
  select count(*) into v_used from public.email_delivery_reservations
  where organisation_id = p_organisation_id and reserved_for = (now() at time zone 'UTC')::date and status in ('reserved', 'sent');
  if v_used >= v_limit then return false; end if;
  insert into public.email_delivery_reservations (organisation_id, delivery_key, delivery_kind, expires_at)
  values (p_organisation_id, p_delivery_key, p_delivery_kind, now() + interval '15 minutes')
  on conflict (delivery_key) do update set status = 'reserved', expires_at = excluded.expires_at, released_at = null
  where public.email_delivery_reservations.status = 'released';
  return true;
end $$;
create or replace function public.email_delivery_set_reservation(p_delivery_key text, p_status text)
returns void language sql security definer set search_path = public as $$
  update public.email_delivery_reservations set status = p_status,
    sent_at = case when p_status = 'sent' then now() else sent_at end,
    released_at = case when p_status = 'released' then now() else null end
  where delivery_key = p_delivery_key;
$$;

create or replace function public.email_campaign_claim_jobs(p_limit integer default 10)
returns setof public.email_campaign_dispatch_jobs language sql security definer set search_path = public as $$
  with recovered as (
    update public.email_campaign_dispatch_jobs set status = case when attempts >= 3 then 'failed' else 'queued' end, locked_at = null,
      last_error = case when attempts >= 3 then 'Worker lease expired after retry limit.' else last_error end
    where status = 'running' and locked_at < now() - interval '15 minutes'
  ), claimed as (
    select id from public.email_campaign_dispatch_jobs where status = 'queued' and run_at <= now()
    order by run_at, created_at for update skip locked limit greatest(1, least(p_limit, 25))
  ) update public.email_campaign_dispatch_jobs j set status = 'running', locked_at = now(), attempts = attempts + 1
  from claimed where j.id = claimed.id returning j.*;
$$;
create or replace function public.email_campaign_claim_recipients(p_campaign_id uuid, p_limit integer default 50, p_variants text[] default null)
returns setof public.email_campaign_recipients language sql security definer set search_path = public as $$
  with recovered as (
    update public.email_campaign_recipients set status = case when send_attempts >= 3 then 'failed' else 'queued' end,
      locked_at = null, next_attempt_at = now(), error_reason = case when send_attempts >= 3 then 'Worker lease expired after retry limit.' else error_reason end
    where campaign_id = p_campaign_id and status = 'sending' and locked_at < now() - interval '15 minutes'
  ), claimed as (
    select id from public.email_campaign_recipients where campaign_id = p_campaign_id and status = 'queued' and next_attempt_at <= now()
      and (p_variants is null or experiment_variant = any(p_variants))
    order by created_at for update skip locked limit greatest(1, least(p_limit, 250))
  ) update public.email_campaign_recipients r set status = 'sending', locked_at = now(), send_attempts = send_attempts + 1
  from claimed where r.id = claimed.id returning r.*;
$$;

create or replace function public.email_automation_claim_deliveries(p_limit integer default 25)
returns setof public.email_automation_deliveries language sql security definer set search_path = public as $$
  with recovered as (
    update public.email_automation_deliveries set status = case when attempts >= 3 then 'failed' else 'queued' end,
      locked_at = null, next_run_at = now(), last_error = case when attempts >= 3 then 'Worker lease expired after retry limit.' else last_error end
    where status = 'processing' and locked_at < now() - interval '15 minutes'
  ), claimed as (
    select id from public.email_automation_deliveries where status = 'queued' and next_run_at <= now()
    order by next_run_at, created_at for update skip locked limit greatest(1, least(p_limit, 100))
  ) update public.email_automation_deliveries d set status = 'processing', locked_at = now(), attempts = attempts + 1
  from claimed where d.id = claimed.id returning d.*;
$$;

revoke all on function public.email_delivery_reserve_quota(uuid, text, text), public.email_delivery_set_reservation(text, text), public.email_campaign_claim_jobs(integer), public.email_campaign_claim_recipients(uuid, integer, text[]) from public, anon, authenticated;
grant execute on function public.email_delivery_reserve_quota(uuid, text, text), public.email_delivery_set_reservation(text, text), public.email_campaign_claim_jobs(integer), public.email_campaign_claim_recipients(uuid, integer, text[]) to service_role;
commit;
