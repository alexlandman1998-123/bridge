alter table if exists public.appointments add column if not exists calendar_event_uid text;
alter table if exists public.appointments add column if not exists ics_generated_at timestamptz;
alter table if exists public.appointments add column if not exists external_calendar_status text not null default 'not_synced';
alter table if exists public.appointments add column if not exists external_calendar_provider text;
alter table if exists public.appointments add column if not exists external_calendar_event_id text;

alter table if exists public.appointments drop constraint if exists appointments_external_calendar_status_check;
alter table if exists public.appointments
  add constraint appointments_external_calendar_status_check
  check (external_calendar_status in ('not_synced', 'ics_generated', 'sync_pending', 'synced', 'sync_failed'));

do $$
begin
  if to_regclass('public.appointments') is null then
    raise notice 'Skipping appointments_external_calendar_status_idx because public.appointments does not exist yet.';
    return;
  end if;

  execute 'create index if not exists appointments_external_calendar_status_idx on public.appointments (external_calendar_status)';
end;
$$;
