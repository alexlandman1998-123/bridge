begin;

set local lock_timeout = '3s';

set local statement_timeout = '10s';

-- Keep the approved Micro tier. Spread background polling across five minutes
-- instead of opening all worker connections at the same minute boundary.
-- Lead acknowledgements and booking-hold expiry retain their one-minute jobs.
do $schedule$
declare
  target record;
  current_job record;
  next_schedule text;
begin
  for target in
    select * from (values
      ('arch9-marketing-event-worker-1m', 0),
      ('arch9-email-campaign-worker', 1),
      ('arch9-listing-viewing-emails-1m', 2),
      ('arch9-attorney-appointment-delivery-1m', 3),
      ('arch9-transaction-handoff-dispatch-1m', 4),
      ('arch9-home-seekers-lead-dispatcher-1m', 0),
      ('arch9-calendar-appointment-delivery-1m', 1),
      ('arch9-calendar-provider-sync-1m', 2),
      ('arch9-recruitment-approval-dispatcher-1m', 3),
      ('arch9-recruitment-submission-dispatcher-1m', 4),
      ('arch9-recruitment-contact-dispatcher-1m', 0),
      ('arch9-document-requirement-delivery-1m', 1),
      ('whatsapp-campaign-worker', 2),
      ('whatsapp-business-app-worker', 3),
      ('whatsapp-automation-worker', 4)
    ) as targets(jobname, minute_offset)
  loop
    select jobid, schedule into current_job
      from cron.job where jobname = target.jobname;
    if not found then
      raise exception 'Expected background job is missing: %', target.jobname;
    end if;
    next_schedule := target.minute_offset::text || '-59/5 * * * *';
    if current_job.schedule not in ('* * * * *', next_schedule) then
      raise exception 'Background job schedule needs review before changing: %', target.jobname;
    end if;
    -- Only the cadence changes. Preserve commands, owners and enabled states.
    perform cron.alter_job(current_job.jobid, next_schedule);
  end loop;
end;
$schedule$;

commit;
