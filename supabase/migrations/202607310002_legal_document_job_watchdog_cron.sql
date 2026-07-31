begin;

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create or replace function public.bridge_run_legal_document_job_watchdog_phase9()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, vault
as $function$
declare
  project_url text;
  service_role_key text;
  request_id bigint;
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
    raise warning 'Arch9 legal document job watchdog is missing its Vault configuration.';
    return jsonb_build_object('scheduled', false, 'reason', 'vault_configuration_missing');
  end if;

  select net.http_post(
    url := rtrim(project_url, '/') || '/functions/v1/legal-document-job-runner',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_role_key,
      'apikey', service_role_key
    ),
    body := jsonb_build_object(
      'action', 'watchdog_retry',
      'batchLimit', 5,
      'dryRun', false,
      'source', 'supabase_cron_legal_document_job_watchdog_phase9'
    )
  ) into request_id;

  return jsonb_build_object(
    'scheduled', true,
    'requestId', request_id,
    'source', 'supabase_cron_legal_document_job_watchdog_phase9'
  );
end;
$function$;

revoke all on function public.bridge_run_legal_document_job_watchdog_phase9() from public, anon, authenticated;
grant execute on function public.bridge_run_legal_document_job_watchdog_phase9() to service_role;

do $block$
declare
  existing_job_id bigint;
begin
  for existing_job_id in
    select jobid
      from cron.job
     where jobname in (
       'arch9-legal-document-job-watchdog-1m'
     )
        or command ilike '%bridge_run_legal_document_job_watchdog_phase9%'
  loop
    perform cron.unschedule(existing_job_id);
  end loop;
end;
$block$;

select cron.schedule(
  'arch9-legal-document-job-watchdog-1m',
  '* * * * *',
  $schedule$select public.bridge_run_legal_document_job_watchdog_phase9();$schedule$
);

notify pgrst, 'reload schema';

commit;
