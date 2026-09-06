begin;

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create or replace function public.website_prepare_lead_notification_dispatch_phase3()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.source = 'agency_website'
    and new.automation_key = 'website_lead_received'
    and new.channel = 'email' then
    new.idempotency_key := coalesce(nullif(new.idempotency_key, ''), new.dedupe_key);
    new.max_dispatch_attempts := case
      when new.event_key = 'new_enquiry_assigned_agent' then 3
      else 5
    end;
    new.next_dispatch_attempt_at := coalesce(new.next_dispatch_attempt_at, new.queued_at, pg_catalog.clock_timestamp());
    new.metadata_json := coalesce(new.metadata_json, '{}'::jsonb) || pg_catalog.jsonb_build_object(
      'dispatchContract', 'website-lead-dispatch-v1',
      'dispatchPhase', 'phase_3_durable_lead_dispatch'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_website_prepare_lead_notification_dispatch_phase3
  on public.notification_events;
create trigger trg_website_prepare_lead_notification_dispatch_phase3
before insert on public.notification_events
for each row execute function public.website_prepare_lead_notification_dispatch_phase3();

update public.notification_events
set idempotency_key = coalesce(nullif(idempotency_key, ''), dedupe_key),
    max_dispatch_attempts = case
      when event_key = 'new_enquiry_assigned_agent' then 3
      else 5
    end,
    next_dispatch_attempt_at = coalesce(next_dispatch_attempt_at, queued_at, created_at),
    metadata_json = coalesce(metadata_json, '{}'::jsonb) || pg_catalog.jsonb_build_object(
      'dispatchContract', 'website-lead-dispatch-v1',
      'dispatchPhase', 'phase_3_durable_lead_dispatch'
    ),
    updated_at = pg_catalog.clock_timestamp()
where source = 'agency_website'
  and automation_key = 'website_lead_received'
  and channel = 'email'
  and status in ('queued', 'failed', 'processing');

create index if not exists notification_events_website_lead_dispatch_idx
  on public.notification_events (
    coalesce(next_dispatch_attempt_at, queued_at, created_at),
    created_at
  )
  where source = 'agency_website'
    and automation_key = 'website_lead_received'
    and channel = 'email'
    and status in ('queued', 'failed');

create or replace function public.website_reset_stale_lead_notification_claims(
  p_before timestamptz default pg_catalog.clock_timestamp() - interval '5 minutes'
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reset_count integer := 0;
begin
  update public.notification_events
  set status = 'failed',
      next_dispatch_attempt_at = pg_catalog.clock_timestamp(),
      last_dispatch_error = 'Interrupted dispatch claim was returned to the website lead queue.',
      error_message = 'Interrupted dispatch claim was returned to the website lead queue.',
      metadata_json = coalesce(metadata_json, '{}'::jsonb) || pg_catalog.jsonb_build_object(
        'staleClaimResetAt', pg_catalog.clock_timestamp()
      ),
      updated_at = pg_catalog.clock_timestamp()
  where source = 'agency_website'
    and automation_key = 'website_lead_received'
    and channel = 'email'
    and status = 'processing'
    and coalesce(last_dispatch_attempt_at, created_at) < coalesce(p_before, pg_catalog.clock_timestamp() - interval '5 minutes')
    and dispatch_attempt_count < max_dispatch_attempts;

  get diagnostics v_reset_count = row_count;
  return v_reset_count;
end;
$$;

create or replace function public.website_claim_lead_notifications(
  p_limit integer default 25,
  p_event_id uuid default null
)
returns setof public.notification_events
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit integer := greatest(0, least(coalesce(p_limit, 25), 100));
begin
  return query
  with next_events as (
    select event.id
    from public.notification_events event
    where event.source = 'agency_website'
      and event.automation_key = 'website_lead_received'
      and event.channel = 'email'
      and event.status in ('queued', 'failed')
      and event.recipient_email is not null
      and event.dispatch_attempt_count < event.max_dispatch_attempts
      and coalesce(event.next_dispatch_attempt_at, event.queued_at, event.created_at) <= pg_catalog.clock_timestamp()
      and (p_event_id is null or event.id = p_event_id)
    order by coalesce(event.next_dispatch_attempt_at, event.queued_at, event.created_at), event.created_at
    limit v_limit
    for update skip locked
  )
  update public.notification_events event
  set status = 'processing',
      dispatch_attempt_count = event.dispatch_attempt_count + 1,
      last_dispatch_attempt_at = pg_catalog.clock_timestamp(),
      next_dispatch_attempt_at = null,
      last_dispatch_error = null,
      error_message = null,
      metadata_json = coalesce(event.metadata_json, '{}'::jsonb) || pg_catalog.jsonb_build_object(
        'dispatchClaimedAt', pg_catalog.clock_timestamp()
      ),
      updated_at = pg_catalog.clock_timestamp()
  from next_events
  where event.id = next_events.id
  returning event.*;
end;
$$;

create or replace function public.website_complete_lead_notification(
  p_receipt_id uuid,
  p_notification_event_id uuid,
  p_delivery_status text,
  p_provider_message_id text default null,
  p_error_message text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_receipt public.website_lead_submissions%rowtype;
  v_event public.notification_events%rowtype;
  v_status text := pg_catalog.lower(trim(coalesce(p_delivery_status, '')));
  v_is_fallback boolean;
  v_retry_scheduled boolean := false;
  v_terminal boolean := true;
  v_next_attempt timestamptz;
begin
  if v_status not in ('sent', 'failed', 'skipped') then
    raise exception 'Unsupported delivery status.' using errcode = '22023';
  end if;

  select submission.* into v_receipt
  from public.website_lead_submissions submission
  where submission.id = p_receipt_id
  for update;

  v_is_fallback := v_receipt.fallback_notification_event_id = p_notification_event_id;
  if v_receipt.id is null
    or (v_receipt.notification_event_id is distinct from p_notification_event_id and not v_is_fallback) then
    raise exception 'Notification does not belong to the website submission.' using errcode = '42501';
  end if;

  select event.* into v_event
  from public.notification_events event
  where event.id = p_notification_event_id
    and event.source = 'agency_website'
    and event.automation_key = 'website_lead_received'
  for update;

  if v_event.id is null then
    raise exception 'Website lead notification was not found.' using errcode = 'P0002';
  end if;

  if v_status = 'failed' and v_event.dispatch_attempt_count < v_event.max_dispatch_attempts then
    v_retry_scheduled := true;
    v_terminal := false;
    v_next_attempt := v_now + case v_event.dispatch_attempt_count
      when 1 then interval '1 minute'
      when 2 then interval '5 minutes'
      when 3 then interval '15 minutes'
      when 4 then interval '30 minutes'
      else interval '1 hour'
    end;
  end if;

  update public.notification_events
  set status = v_status,
      provider = case when v_status = 'sent' then 'resend' else provider end,
      provider_message_id = case
        when v_status = 'sent' then nullif(pg_catalog.left(coalesce(p_provider_message_id, ''), 500), '')
        else provider_message_id
      end,
      error_message = case
        when v_status = 'failed' then nullif(pg_catalog.left(coalesce(p_error_message, ''), 1000), '')
        else null
      end,
      last_dispatch_error = case
        when v_status = 'failed' then nullif(pg_catalog.left(coalesce(p_error_message, ''), 1000), '')
        else null
      end,
      next_dispatch_attempt_at = v_next_attempt,
      sent_at = case when v_status = 'sent' then v_now else sent_at end,
      failed_at = case when v_status = 'failed' and v_terminal then v_now else null end,
      metadata_json = coalesce(metadata_json, '{}'::jsonb) || pg_catalog.jsonb_build_object(
        'dispatchCompletedAt', v_now,
        'retryScheduled', v_retry_scheduled,
        'terminal', v_terminal
      ),
      updated_at = v_now
  where id = p_notification_event_id;

  update public.website_lead_submissions
  set notification_status = case
        when v_status = 'sent' and v_is_fallback then 'fallback_sent'
        when v_status = 'sent' then 'sent'
        when v_status = 'skipped' then 'skipped'
        when v_retry_scheduled then 'pending'
        else 'failed'
      end,
      failure_reason = case
        when v_status = 'failed' then nullif(pg_catalog.left(coalesce(p_error_message, ''), 500), '')
        else null
      end,
      updated_at = v_now
  where id = p_receipt_id;

  return pg_catalog.jsonb_build_object(
    'recorded', true,
    'fallback', v_is_fallback,
    'status', v_status,
    'retryScheduled', v_retry_scheduled,
    'terminal', v_terminal,
    'attemptCount', v_event.dispatch_attempt_count,
    'maxAttempts', v_event.max_dispatch_attempts,
    'nextAttemptAt', v_next_attempt
  );
end;
$$;

create or replace function public.website_run_lead_notification_dispatcher()
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
  from vault.decrypted_secrets secret
  where secret.name = 'arch9_project_url'
  limit 1;

  select secret.decrypted_secret into v_service_role_key
  from vault.decrypted_secrets secret
  where secret.name = 'arch9_service_role_key'
  limit 1;

  if nullif(trim(v_project_url), '') is null or nullif(trim(v_service_role_key), '') is null then
    raise warning 'Website lead dispatcher is missing Vault configuration.';
    return pg_catalog.jsonb_build_object('scheduled', false, 'reason', 'vault_configuration_missing');
  end if;

  select net.http_post(
    url := pg_catalog.rtrim(v_project_url, '/') || '/functions/v1/website-lead-dispatcher',
    headers := pg_catalog.jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_service_role_key,
      'apikey', v_service_role_key
    ),
    body := pg_catalog.jsonb_build_object('limit', 25),
    timeout_milliseconds := 15000
  ) into v_request_id;

  return pg_catalog.jsonb_build_object('scheduled', true, 'requestId', v_request_id);
end;
$$;

revoke all on function public.website_prepare_lead_notification_dispatch_phase3() from public, anon, authenticated;
revoke all on function public.website_reset_stale_lead_notification_claims(timestamptz) from public, anon, authenticated;
revoke all on function public.website_claim_lead_notifications(integer, uuid) from public, anon, authenticated;
revoke all on function public.website_complete_lead_notification(uuid, uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.website_run_lead_notification_dispatcher() from public, anon, authenticated;

grant execute on function public.website_reset_stale_lead_notification_claims(timestamptz) to service_role;
grant execute on function public.website_claim_lead_notifications(integer, uuid) to service_role;
grant execute on function public.website_complete_lead_notification(uuid, uuid, text, text, text) to service_role;
grant execute on function public.website_run_lead_notification_dispatcher() to service_role;

do $$
declare
  v_job_id bigint;
begin
  for v_job_id in
    select job.jobid from cron.job job where job.jobname = 'arch9-website-lead-dispatcher-1m'
  loop
    perform cron.unschedule(v_job_id);
  end loop;
end;
$$;

select cron.schedule(
  'arch9-website-lead-dispatcher-1m',
  '* * * * *',
  $schedule$select public.website_run_lead_notification_dispatcher();$schedule$
);

comment on function public.website_claim_lead_notifications(integer, uuid) is
  'Service-role-only atomic claim for due website lead email outbox events.';
comment on function public.website_reset_stale_lead_notification_claims(timestamptz) is
  'Returns interrupted website lead email claims to the durable retry queue.';
comment on function public.website_run_lead_notification_dispatcher() is
  'Schedules the service-only website lead dispatcher through pg_net using Vault credentials.';

commit;
