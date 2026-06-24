begin;

alter table if exists public.launch_event_leads
  add column if not exists event_name text not null default 'Arch9 Launch',
  add column if not exists event_date date not null default date '2026-06-24',
  add column if not exists role_type text,
  add column if not exists discussion_focus text,
  add column if not exists preferred_time text;

alter table if exists public.launch_event_leads
  alter column source set default 'arch9_launch_qr';

alter table if exists public.launch_event_leads
  drop constraint if exists launch_event_leads_source_check;

alter table if exists public.launch_event_leads
  add constraint launch_event_leads_source_check
  check (source in ('event_qr', 'arch9_launch_qr', 'manual', 'import'));

update public.launch_event_leads
set
  role_type = coalesce(role_type, interest),
  preferred_time = coalesce(preferred_time, preferred_window),
  source = case when source = 'event_qr' then 'arch9_launch_qr' else source end
where event_slug = 'arch9-launch-2026-06-24';

drop policy if exists "Launch event guests can submit leads" on public.launch_event_leads;
create policy "Launch event guests can submit leads"
  on public.launch_event_leads
  for insert
  to anon, authenticated
  with check (
    event_slug = 'arch9-launch-2026-06-24'
    and status = 'new'
    and source in ('event_qr', 'arch9_launch_qr')
  );

commit;
