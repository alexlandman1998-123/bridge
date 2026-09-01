-- Phase 8: privileged worker bridge for CRM handoffs and due RSVP messages.
alter table public.marketing_event_rsvp_messages
  add column if not exists dispatch_attempts integer not null default 0 check (dispatch_attempts >= 0),
  add column if not exists last_attempt_at timestamptz;

create index if not exists marketing_event_rsvp_messages_due_queue_idx
  on public.marketing_event_rsvp_messages (status, scheduled_for)
  where status = 'queued';

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create or replace function public.bridge_run_marketing_event_worker_phase8()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, vault
as $function$
declare
  v_project_url text;
  v_service_role_key text;
  v_request_id bigint;
begin
  select decrypted_secret into v_project_url
  from vault.decrypted_secrets where name = 'arch9_project_url' limit 1;
  select decrypted_secret into v_service_role_key
  from vault.decrypted_secrets where name = 'arch9_service_role_key' limit 1;
  if nullif(trim(v_project_url), '') is null or nullif(trim(v_service_role_key), '') is null then
    raise warning 'Marketing event worker is missing Vault configuration.';
    return jsonb_build_object('scheduled', false, 'reason', 'vault_configuration_missing');
  end if;
  select net.http_post(
    url := rtrim(v_project_url, '/') || '/functions/v1/marketing-event-worker',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_service_role_key, 'apikey', v_service_role_key),
    body := jsonb_build_object('limit', 50),
    timeout_milliseconds := 15000
  ) into v_request_id;
  return jsonb_build_object('scheduled', true, 'request_id', v_request_id);
end;
$function$;

revoke all on function public.bridge_run_marketing_event_worker_phase8() from public, anon, authenticated;
grant execute on function public.bridge_run_marketing_event_worker_phase8() to service_role;

do $block$
declare v_job_id bigint;
begin
  for v_job_id in select jobid from cron.job where jobname = 'arch9-marketing-event-worker-1m' loop
    perform cron.unschedule(v_job_id);
  end loop;
end;
$block$;

select cron.schedule(
  'arch9-marketing-event-worker-1m',
  '* * * * *',
  $schedule$select public.bridge_run_marketing_event_worker_phase8();$schedule$
);
