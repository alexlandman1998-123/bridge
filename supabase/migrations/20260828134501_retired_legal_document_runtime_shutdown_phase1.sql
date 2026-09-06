begin;

-- Phase 1 retirement boundary: no database scheduler may invoke the legal
-- document generator, watchdog, or signing-reminder automation. Match both
-- canonical job names and commands so older deployments are also contained.
do $block$
declare
  target_job record;
begin
  if to_regclass('cron.job') is null then
    return;
  end if;

  for target_job in
    select jobid
      from cron.job
     where jobname in (
       'arch9-legal-document-job-watchdog-1m',
       'arch9-legal-document-signing-reminders-hourly'
     )
        or command ilike '%legal_document%'
        or command ilike '%legal-document%'
  loop
    perform cron.unschedule(target_job.jobid);
  end loop;
end;
$block$;

-- Remove the callable scheduler bridges as well. Keeping no-op SECURITY
-- DEFINER functions after retirement leaves an unnecessary privileged surface.
drop function if exists public.bridge_run_legal_document_job_watchdog_phase9();
drop function if exists public.bridge_queue_legal_document_signing_reminders_phase1(integer, timestamptz, boolean);

notify pgrst, 'reload schema';

commit;
