-- Marketing events, phase 1: shared internal records for Show Days and Launches.
-- Public RSVP submission is deliberately not exposed until phase 2.

create table public.marketing_events (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  event_type text not null check (event_type in ('show_day', 'launch')),
  status text not null default 'draft' check (status in ('draft', 'planning', 'upcoming', 'completed', 'cancelled')),
  title text not null check (length(btrim(title)) between 1 and 180),
  subject_type text not null check (subject_type in ('listing', 'development', 'phase', 'unlinked')),
  subject_id uuid,
  subject_label text,
  location text,
  address text,
  timezone text not null default 'Africa/Johannesburg',
  starts_at timestamptz,
  ends_at timestamptz,
  host_user_id uuid references auth.users(id) on delete set null,
  image_url text,
  description text,
  metadata jsonb not null default '{}'::jsonb,
  public_token text not null unique default replace(gen_random_uuid()::text, '-', ''),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);

create index marketing_events_organisation_starts_idx on public.marketing_events (organisation_id, starts_at desc);
create index marketing_events_organisation_type_status_idx on public.marketing_events (organisation_id, event_type, status);
create index marketing_events_subject_idx on public.marketing_events (organisation_id, subject_type, subject_id);

alter table public.marketing_events enable row level security;
revoke all on public.marketing_events from anon;
grant select, insert, update, delete on public.marketing_events to authenticated;

create policy marketing_events_select_scoped
  on public.marketing_events for select to authenticated
  using (public.bridge_has_organisation_membership(organisation_id));

create policy marketing_events_insert_scoped
  on public.marketing_events for insert to authenticated
  with check (
    public.bridge_has_organisation_membership(organisation_id)
    and created_by = (select auth.uid())
  );

create policy marketing_events_update_scoped
  on public.marketing_events for update to authenticated
  using (public.bridge_has_organisation_membership(organisation_id))
  with check (public.bridge_has_organisation_membership(organisation_id));

create policy marketing_events_delete_scoped
  on public.marketing_events for delete to authenticated
  using (public.bridge_has_organisation_membership(organisation_id));

create or replace function public.marketing_events_set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger marketing_events_updated_at
before update on public.marketing_events
for each row execute function public.marketing_events_set_updated_at();
