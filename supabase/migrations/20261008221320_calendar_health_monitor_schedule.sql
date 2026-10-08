begin;
create extension if not exists pg_cron;
-- Collection observes private state only: no recipient messages or repairs.
select cron.schedule('arch9-calendar-health-5m','*/5 * * * *',
 $schedule$select public.collect_calendar_health(25);$schedule$);
commit;
