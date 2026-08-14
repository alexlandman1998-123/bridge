begin;

do $block$
declare
  target_job record;
begin
  for target_job in
    select jobid, jobname
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

create or replace function public.bridge_run_legal_document_job_watchdog_phase9()
returns jsonb
language sql
security definer
set search_path = public
as $function$
  select jsonb_build_object(
    'scheduled', false,
    'disabled', true,
    'reason', 'legal_document_automation_decommissioned'
  );
$function$;

drop function if exists public.bridge_queue_legal_document_signing_reminders_phase1(integer, timestamptz, boolean);

create or replace function public.bridge_queue_legal_document_signing_reminders_phase1(
  batch_limit integer default 100,
  reference_time timestamptz default now(),
  dry_run boolean default false
)
returns jsonb
language sql
security definer
set search_path = public
as $function$
  select jsonb_build_object(
    'queued', 0,
    'disabled', true,
    'reason', 'legal_document_automation_decommissioned'
  );
$function$;

revoke all on function public.bridge_run_legal_document_job_watchdog_phase9()
  from public, anon, authenticated, service_role;
revoke all on function public.bridge_queue_legal_document_signing_reminders_phase1(integer, timestamptz, boolean)
  from public, anon, authenticated, service_role;

comment on function public.bridge_run_legal_document_job_watchdog_phase9() is
  'Decommissioned on 2026-08-14. Legal document generation automation is disabled and no cron should call this function.';
comment on function public.bridge_queue_legal_document_signing_reminders_phase1(integer, timestamptz, boolean) is
  'Decommissioned on 2026-08-14. Legal document signing reminder automation is disabled and no cron should call this function.';

notify pgrst, 'reload schema';

commit;
