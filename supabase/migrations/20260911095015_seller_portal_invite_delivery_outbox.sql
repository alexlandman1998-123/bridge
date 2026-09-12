begin;

create table if not exists public.private_listing_seller_portal_invite_outbox (
  id uuid primary key default gen_random_uuid(),
  private_listing_id uuid not null references public.private_listings(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  idempotency_key text not null,
  delivery_payload jsonb not null,
  status text not null default 'queued',
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null default 5 check (max_attempts between 1 and 10),
  next_attempt_at timestamptz not null default now(),
  claimed_at timestamptz,
  sent_at timestamptz,
  provider_message_id text,
  last_error text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint private_listing_seller_portal_invite_outbox_status_check
    check (status in ('queued', 'processing', 'sent', 'failed', 'cancelled')),
  constraint private_listing_seller_portal_invite_outbox_idempotency_unique
    unique (idempotency_key)
);

create index if not exists private_listing_seller_portal_invite_outbox_due_idx
  on public.private_listing_seller_portal_invite_outbox (status, next_attempt_at asc);

create extension if not exists pg_net with schema extensions;

alter table public.private_listing_seller_portal_invite_outbox enable row level security;
revoke all on table public.private_listing_seller_portal_invite_outbox from anon;
grant select, insert on table public.private_listing_seller_portal_invite_outbox to authenticated;

create policy private_listing_seller_portal_invite_outbox_select_member
on public.private_listing_seller_portal_invite_outbox
for select to authenticated
using (public.bridge_is_active_member(organisation_id));

create policy private_listing_seller_portal_invite_outbox_insert_member
on public.private_listing_seller_portal_invite_outbox
for insert to authenticated
with check (
  public.bridge_is_active_member(organisation_id)
  and created_by = (select auth.uid())
  and status = 'queued'
);

create or replace function public.bridge_claim_private_listing_seller_portal_invites(
  p_limit integer default 25,
  p_outbox_id uuid default null
)
returns setof public.private_listing_seller_portal_invite_outbox
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role is required to dispatch seller portal invitations.';
  end if;

  return query
  with candidates as (
    select outbox.id
    from public.private_listing_seller_portal_invite_outbox outbox
    where outbox.status = 'queued'
      and outbox.next_attempt_at <= now()
      and (p_outbox_id is null or outbox.id = p_outbox_id)
    order by outbox.created_at asc
    limit greatest(1, least(coalesce(p_limit, 25), 100))
    for update skip locked
  )
  update public.private_listing_seller_portal_invite_outbox outbox
  set status = 'processing',
      attempt_count = outbox.attempt_count + 1,
      claimed_at = now(),
      updated_at = now(),
      last_error = null
  from candidates
  where outbox.id = candidates.id
  returning outbox.*;
end;
$$;

create or replace function public.bridge_complete_private_listing_seller_portal_invite(
  p_outbox_id uuid,
  p_sent boolean,
  p_provider_message_id text default null,
  p_error_message text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.private_listing_seller_portal_invite_outbox%rowtype;
  v_retry_at timestamptz;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role is required to complete seller portal invitation delivery.';
  end if;
  select * into v_job from public.private_listing_seller_portal_invite_outbox where id = p_outbox_id for update;
  if not found then raise exception 'Seller portal invitation job not found.'; end if;
  if v_job.status <> 'processing' then
    return jsonb_build_object('ok', true, 'status', v_job.status, 'retryScheduled', false);
  end if;
  if p_sent then
    update public.private_listing_seller_portal_invite_outbox
    set status = 'sent', sent_at = now(), provider_message_id = nullif(trim(p_provider_message_id), ''),
        last_error = null, updated_at = now()
    where id = p_outbox_id;
    return jsonb_build_object('ok', true, 'status', 'sent', 'retryScheduled', false);
  end if;
  if v_job.attempt_count >= v_job.max_attempts then
    update public.private_listing_seller_portal_invite_outbox
    set status = 'failed', last_error = nullif(trim(p_error_message), ''), updated_at = now()
    where id = p_outbox_id;
    return jsonb_build_object('ok', true, 'status', 'failed', 'retryScheduled', false);
  end if;
  v_retry_at := now() + make_interval(mins => least(60, power(2, v_job.attempt_count)::integer));
  update public.private_listing_seller_portal_invite_outbox
  set status = 'queued', next_attempt_at = v_retry_at, last_error = nullif(trim(p_error_message), ''), updated_at = now()
  where id = p_outbox_id;
  return jsonb_build_object('ok', true, 'status', 'queued', 'retryScheduled', true, 'nextAttemptAt', v_retry_at);
end;
$$;

revoke all on function public.bridge_claim_private_listing_seller_portal_invites(integer, uuid) from public, anon, authenticated;
revoke all on function public.bridge_complete_private_listing_seller_portal_invite(uuid, boolean, text, text) from public, anon, authenticated;
grant execute on function public.bridge_claim_private_listing_seller_portal_invites(integer, uuid) to service_role;
grant execute on function public.bridge_complete_private_listing_seller_portal_invite(uuid, boolean, text, text) to service_role;

create or replace function public.bridge_run_private_listing_seller_portal_invite_dispatcher()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project_url text;
  v_service_role_key text;
  v_request_id bigint;
begin
  select secret.decrypted_secret into v_project_url
  from vault.decrypted_secrets secret where secret.name = 'arch9_project_url' limit 1;
  select secret.decrypted_secret into v_service_role_key
  from vault.decrypted_secrets secret where secret.name = 'arch9_service_role_key' limit 1;
  if nullif(trim(v_project_url), '') is null or nullif(trim(v_service_role_key), '') is null then
    raise warning 'Seller portal invite dispatcher is missing Vault configuration.';
    return jsonb_build_object('scheduled', false, 'reason', 'vault_configuration_missing');
  end if;
  select net.http_post(
    url := pg_catalog.rtrim(v_project_url, '/') || '/functions/v1/seller-portal-invite-dispatcher',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_service_role_key, 'apikey', v_service_role_key),
    body := jsonb_build_object('limit', 25), timeout_milliseconds := 15000
  ) into v_request_id;
  return jsonb_build_object('scheduled', true, 'requestId', v_request_id);
end;
$$;

revoke all on function public.bridge_run_private_listing_seller_portal_invite_dispatcher() from public, anon, authenticated;
grant execute on function public.bridge_run_private_listing_seller_portal_invite_dispatcher() to service_role;

do $$
declare v_job_id bigint;
begin
  for v_job_id in select job.jobid from cron.job job where job.jobname = 'arch9-seller-portal-invite-dispatcher-1m'
  loop perform cron.unschedule(v_job_id); end loop;
end;
$$;

select cron.schedule(
  'arch9-seller-portal-invite-dispatcher-1m',
  '* * * * *',
  $schedule$select public.bridge_run_private_listing_seller_portal_invite_dispatcher();$schedule$
);

commit;
