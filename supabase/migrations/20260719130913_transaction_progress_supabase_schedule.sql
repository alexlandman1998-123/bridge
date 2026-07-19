begin;

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create or replace function public.bridge_run_transaction_progress_schedule_phase7()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, vault
as $function$
declare
  project_url text;
  service_role_key text;
  dispatch_request_id bigint;
  assurance_request_id bigint;
begin
  select decrypted_secret
    into project_url
    from vault.decrypted_secrets
   where name = 'arch9_project_url'
   limit 1;

  select decrypted_secret
    into service_role_key
    from vault.decrypted_secrets
   where name = 'arch9_service_role_key'
   limit 1;

  if nullif(trim(project_url), '') is null or nullif(trim(service_role_key), '') is null then
    raise warning 'Arch9 transaction progress schedule is missing its Vault configuration.';
    return jsonb_build_object('scheduled', false, 'reason', 'vault_configuration_missing');
  end if;

  select net.http_post(
    url := rtrim(project_url, '/') || '/functions/v1/send-email',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_role_key,
      'apikey', service_role_key
    ),
    body := jsonb_build_object(
      'type', 'transaction_progress_dispatch',
      'limit', 100,
      'source', 'supabase_cron_phase7'
    )
  ) into dispatch_request_id;

  select net.http_post(
    url := rtrim(project_url, '/') || '/rest/v1/rpc/bridge_run_transaction_progress_assurance_phase7',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_role_key,
      'apikey', service_role_key
    ),
    body := jsonb_build_object(
      'p_environment', 'production',
      'p_limit', 100,
      'p_source', 'supabase_cron_phase7'
    )
  ) into assurance_request_id;

  return jsonb_build_object(
    'scheduled', true,
    'dispatchRequestId', dispatch_request_id,
    'assuranceRequestId', assurance_request_id
  );
end;
$function$;

revoke all on function public.bridge_run_transaction_progress_schedule_phase7() from public, anon, authenticated;
grant execute on function public.bridge_run_transaction_progress_schedule_phase7() to service_role;

do $block$
declare
  existing_job_id bigint;
begin
  for existing_job_id in
    select jobid
      from cron.job
     where jobname = 'arch9-transaction-progress-assurance-5m'
  loop
    perform cron.unschedule(existing_job_id);
  end loop;
end;
$block$;

select cron.schedule(
  'arch9-transaction-progress-assurance-5m',
  '*/5 * * * *',
  $schedule$select public.bridge_run_transaction_progress_schedule_phase7();$schedule$
);

commit;
