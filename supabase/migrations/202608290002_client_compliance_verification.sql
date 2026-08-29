begin;

create table if not exists public.compliance_profiles (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  client_contact_id uuid not null references public.contacts(contact_id) on delete cascade,
  entity_type text not null default 'individual',
  current_status text not null default 'not_started',
  current_risk_rating text not null default 'unknown',
  last_verified_at timestamptz,
  next_review_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, client_contact_id)
);

create table if not exists public.compliance_verification_runs (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  client_contact_id uuid not null references public.contacts(contact_id) on delete cascade,
  compliance_profile_id uuid not null references public.compliance_profiles(id) on delete cascade,
  provider text not null,
  provider_reference text,
  status text not null default 'in_progress',
  initiated_by uuid references auth.users(id) on delete set null default auth.uid(),
  initiated_at timestamptz not null default now(),
  completed_at timestamptz,
  risk_rating text not null default 'unknown',
  raw_response_reference text,
  report_reference text,
  created_at timestamptz not null default now(),
  constraint compliance_verification_run_status_check check (status in ('in_progress','verified','review_required','failed','incomplete','expired')),
  constraint compliance_verification_risk_check check (risk_rating in ('low','medium','high','review_required','unknown'))
);

create table if not exists public.compliance_verification_checks (
  id uuid primary key default gen_random_uuid(),
  verification_run_id uuid not null references public.compliance_verification_runs(id) on delete cascade,
  check_type text not null,
  status text not null,
  result text,
  provider_code text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (verification_run_id, check_type)
);

create table if not exists public.compliance_verification_audit_events (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  client_contact_id uuid not null references public.contacts(contact_id) on delete cascade,
  verification_run_id uuid references public.compliance_verification_runs(id) on delete set null,
  action text not null,
  actor_user_id uuid references auth.users(id) on delete set null default auth.uid(),
  provider_reference text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists compliance_profiles_client_idx on public.compliance_profiles (organisation_id, client_contact_id);
create index if not exists compliance_runs_client_idx on public.compliance_verification_runs (organisation_id, client_contact_id, created_at desc);
create index if not exists compliance_checks_run_idx on public.compliance_verification_checks (verification_run_id);
create index if not exists compliance_audit_client_idx on public.compliance_verification_audit_events (organisation_id, client_contact_id, created_at desc);

alter table public.compliance_profiles enable row level security;
alter table public.compliance_verification_runs enable row level security;
alter table public.compliance_verification_checks enable row level security;
alter table public.compliance_verification_audit_events enable row level security;

create policy compliance_profiles_member_access on public.compliance_profiles for all
using (public.bridge_is_active_member(organisation_id)) with check (public.bridge_is_active_member(organisation_id));
create policy compliance_runs_member_access on public.compliance_verification_runs for all
using (public.bridge_is_active_member(organisation_id)) with check (public.bridge_is_active_member(organisation_id));
create policy compliance_checks_member_access on public.compliance_verification_checks for all
using (exists (select 1 from public.compliance_verification_runs run where run.id = verification_run_id and public.bridge_is_active_member(run.organisation_id)))
with check (exists (select 1 from public.compliance_verification_runs run where run.id = verification_run_id and public.bridge_is_active_member(run.organisation_id)));
create policy compliance_audit_member_access on public.compliance_verification_audit_events for all
using (public.bridge_is_active_member(organisation_id)) with check (public.bridge_is_active_member(organisation_id));

grant select, insert, update on public.compliance_profiles, public.compliance_verification_runs, public.compliance_verification_checks, public.compliance_verification_audit_events to authenticated;

commit;
