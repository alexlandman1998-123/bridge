begin;

-- Extend the existing Home Seekers seller-only worker to all website enquiries.
-- Claims, provider idempotency and backoff remain owned by the durable dispatcher.
create or replace function public.website_run_home_seekers_lead_dispatcher()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project_url text;
  v_service_role_key text;
  v_event_id uuid;
  v_scheduled integer := 0;
begin
  select secret.decrypted_secret into v_project_url
  from vault.decrypted_secrets secret where secret.name = 'arch9_project_url' limit 1;
  select secret.decrypted_secret into v_service_role_key
  from vault.decrypted_secrets secret where secret.name = 'arch9_service_role_key' limit 1;
  if nullif(pg_catalog.btrim(v_project_url), '') is null
    or nullif(pg_catalog.btrim(v_service_role_key), '') is null then
    return pg_catalog.jsonb_build_object('scheduled', 0, 'reason', 'vault_configuration_missing');
  end if;

  -- Recover interrupted claims only for this organisation; never claim or flush
  -- notifications belonging to another agency from this customer-specific job.
  update public.notification_events event
  set status = 'failed', next_dispatch_attempt_at = pg_catalog.clock_timestamp(),
      last_dispatch_error = 'Interrupted Home Seekers dispatch returned to the queue.',
      updated_at = pg_catalog.clock_timestamp()
  where event.organisation_id = '2958d402-368e-43c9-b728-0098e10505f1'::uuid
    and event.source = 'agency_website' and event.automation_key = 'website_lead_received'
    and event.channel = 'email' and event.status = 'processing'
    and coalesce(event.last_dispatch_attempt_at, event.created_at) < pg_catalog.clock_timestamp() - interval '5 minutes'
    and event.dispatch_attempt_count < event.max_dispatch_attempts;

  for v_event_id in
    select event.id from public.notification_events event
    join public.website_lead_submissions receipt
      on receipt.organisation_id = event.organisation_id
      and receipt.status = 'routed' and receipt.lead_id = event.lead_id
      and (receipt.notification_event_id = event.id or receipt.fallback_notification_event_id = event.id)
    join public.leads lead on lead.lead_id = receipt.lead_id and lead.organisation_id = receipt.organisation_id
    where event.organisation_id = '2958d402-368e-43c9-b728-0098e10505f1'::uuid
      and event.source = 'agency_website' and event.automation_key = 'website_lead_received'
      and event.channel = 'email' and event.status in ('queued', 'failed')
      and event.recipient_email is not null
      and event.dispatch_attempt_count < event.max_dispatch_attempts
      and coalesce(event.next_dispatch_attempt_at, event.queued_at, event.created_at) <= pg_catalog.clock_timestamp()
    order by coalesce(event.next_dispatch_attempt_at, event.queued_at, event.created_at), event.created_at
    limit 25
  loop
    perform net.http_post(
      url := pg_catalog.rtrim(v_project_url, '/') || '/functions/v1/website-lead-dispatcher',
      headers := pg_catalog.jsonb_build_object('Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_service_role_key, 'apikey', v_service_role_key),
      body := pg_catalog.jsonb_build_object('eventId', v_event_id), timeout_milliseconds := 15000
    );
    v_scheduled := v_scheduled + 1;
  end loop;
  return pg_catalog.jsonb_build_object('scheduled', v_scheduled);
end;
$$;

revoke all on function public.website_run_home_seekers_lead_dispatcher() from public, anon, authenticated;
grant execute on function public.website_run_home_seekers_lead_dispatcher() to service_role;

do $schedule$
declare v_job_id bigint;
begin
  for v_job_id in select job.jobid from cron.job job where job.jobname = 'arch9-home-seekers-seller-dispatcher-1m'
  loop perform cron.unschedule(v_job_id); end loop;
  if not exists (select 1 from cron.job job where job.jobname = 'arch9-home-seekers-lead-dispatcher-1m') then
    perform cron.schedule('arch9-home-seekers-lead-dispatcher-1m', '* * * * *',
      $command$select public.website_run_home_seekers_lead_dispatcher();$command$);
  end if;
end;
$schedule$;

comment on function public.website_run_home_seekers_lead_dispatcher() is
  'Service-only retry scheduling for live Home Seekers website enquiries, excluding other agencies and orphaned receipts.';
commit;
