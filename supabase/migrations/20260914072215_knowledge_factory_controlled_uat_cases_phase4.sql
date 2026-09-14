begin;

-- A deliberately small, administrator-controlled UAT register. This records
-- test intent and outcome only; it must never hold supplier payloads, owner
-- information, identity numbers, credentials or credit/FICA data.
create table public.knowledge_factory_uat_cases (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete restrict,
  property_id bigint not null check (property_id > 0),
  scenario text not null check (scenario in ('map_parcel', 'property_snapshot', 'municipal_valuation')),
  request_purpose text not null check (length(btrim(request_purpose)) between 10 and 500),
  expected_outcome text not null check (length(btrim(expected_outcome)) between 10 and 1000),
  status text not null default 'planned' check (status in ('planned', 'running', 'passed', 'failed', 'cancelled')),
  outcome_note text check (outcome_note is null or length(btrim(outcome_note)) <= 1000),
  report_request_id uuid references public.knowledge_factory_report_requests(id) on delete set null,
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid references auth.users(id) on delete set null,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint knowledge_factory_uat_cases_lifecycle_check check (
    (status = 'planned' and started_at is null and completed_at is null)
    or (status = 'running' and started_at is not null and completed_at is null)
    or (status in ('passed', 'failed', 'cancelled') and completed_at is not null)
  )
);

create index knowledge_factory_uat_cases_organisation_status_idx
  on public.knowledge_factory_uat_cases (organisation_id, status, created_at desc);

create table public.knowledge_factory_uat_case_events (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.knowledge_factory_uat_cases(id) on delete restrict,
  organisation_id uuid not null references public.organisations(id) on delete restrict,
  actor_id uuid not null references auth.users(id) on delete restrict,
  event_type text not null check (event_type in ('created', 'started', 'passed', 'failed', 'cancelled', 'note_updated')),
  event_note text check (event_note is null or length(btrim(event_note)) <= 1000),
  created_at timestamptz not null default now()
);

create index knowledge_factory_uat_case_events_case_created_idx
  on public.knowledge_factory_uat_case_events (case_id, created_at desc);

create or replace function public.knowledge_factory_reject_uat_case_event_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Knowledge Factory UAT case events are immutable.';
end;
$$;

create trigger knowledge_factory_uat_case_events_immutable
before update or delete on public.knowledge_factory_uat_case_events
for each row execute function public.knowledge_factory_reject_uat_case_event_mutation();

alter table public.knowledge_factory_uat_cases enable row level security;
alter table public.knowledge_factory_uat_case_events enable row level security;

revoke all on public.knowledge_factory_uat_cases, public.knowledge_factory_uat_case_events from anon, authenticated;
grant select on public.knowledge_factory_uat_cases, public.knowledge_factory_uat_case_events to authenticated;

create policy knowledge_factory_uat_cases_admin_read
on public.knowledge_factory_uat_cases for select to authenticated
using (public.knowledge_factory_is_active_member(
  organisation_id,
  array['principal', 'owner', 'director', 'admin', 'super_admin', 'agency_admin']
));

create policy knowledge_factory_uat_case_events_admin_read
on public.knowledge_factory_uat_case_events for select to authenticated
using (public.knowledge_factory_is_active_member(
  organisation_id,
  array['principal', 'owner', 'director', 'admin', 'super_admin', 'agency_admin']
));

revoke all on function public.knowledge_factory_reject_uat_case_event_mutation() from public;

comment on table public.knowledge_factory_uat_cases is 'Controlled UAT register. Contains only a property ID, test scenario and outcome metadata; no supplier payloads or sensitive personal data.';
comment on table public.knowledge_factory_uat_case_events is 'Immutable audit history for the controlled Knowledge Factory UAT register.';

commit;
