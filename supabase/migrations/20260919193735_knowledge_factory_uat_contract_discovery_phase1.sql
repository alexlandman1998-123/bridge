begin;

-- Phase 1 records the UAT contract we have proven, rather than retaining
-- supplier responses. It must never contain owner names, identity numbers,
-- documents, bearer tokens, credit-bureau results or raw GraphQL payloads.
create table public.knowledge_factory_uat_contract_checks (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete restrict,
  operation_key text not null check (operation_key in (
    'property_by_id', 'owners', 'municipal_valuation', 'transfers',
    'bonds', 'recent_sales', 'avm', 'fica_kyc_contract'
  )),
  supplier_operation text not null check (length(btrim(supplier_operation)) between 2 and 120),
  request_purpose text not null check (length(btrim(request_purpose)) between 10 and 500),
  expected_field_manifest jsonb not null default '[]'::jsonb check (jsonb_typeof(expected_field_manifest) = 'array'),
  observed_field_manifest jsonb not null default '[]'::jsonb check (jsonb_typeof(observed_field_manifest) = 'array'),
  cost_evidence jsonb not null default '{}'::jsonb check (jsonb_typeof(cost_evidence) = 'object'),
  status text not null default 'planned' check (status in ('planned', 'running', 'passed', 'failed', 'blocked')),
  outcome_note text check (outcome_note is null or length(btrim(outcome_note)) <= 1000),
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid references auth.users(id) on delete restrict,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint knowledge_factory_uat_contract_checks_lifecycle_check check (
    (status = 'planned' and started_at is null and completed_at is null)
    or (status = 'running' and started_at is not null and completed_at is null)
    or (status in ('passed', 'failed', 'blocked') and completed_at is not null)
  )
);

create index knowledge_factory_uat_contract_checks_org_status_idx
  on public.knowledge_factory_uat_contract_checks (organisation_id, status, created_at desc);

create table public.knowledge_factory_uat_contract_check_events (
  id uuid primary key default gen_random_uuid(),
  contract_check_id uuid not null references public.knowledge_factory_uat_contract_checks(id) on delete restrict,
  organisation_id uuid not null references public.organisations(id) on delete restrict,
  actor_id uuid not null references auth.users(id) on delete restrict,
  event_type text not null check (event_type in ('created', 'started', 'passed', 'failed', 'blocked', 'updated')),
  event_note text check (event_note is null or length(btrim(event_note)) <= 1000),
  created_at timestamptz not null default now()
);

create index knowledge_factory_uat_contract_check_events_case_created_idx
  on public.knowledge_factory_uat_contract_check_events (contract_check_id, created_at desc);

create or replace function public.knowledge_factory_reject_uat_contract_check_event_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'Knowledge Factory UAT contract-check events are immutable.';
end;
$$;

create trigger knowledge_factory_uat_contract_check_events_immutable
before update or delete on public.knowledge_factory_uat_contract_check_events
for each row execute function public.knowledge_factory_reject_uat_contract_check_event_mutation();

alter table public.knowledge_factory_uat_contract_checks enable row level security;
alter table public.knowledge_factory_uat_contract_check_events enable row level security;
revoke all on public.knowledge_factory_uat_contract_checks, public.knowledge_factory_uat_contract_check_events from anon, authenticated;
grant select on public.knowledge_factory_uat_contract_checks, public.knowledge_factory_uat_contract_check_events to authenticated;

create policy knowledge_factory_uat_contract_checks_admin_read
on public.knowledge_factory_uat_contract_checks for select to authenticated
using (public.knowledge_factory_is_active_member(organisation_id, array['principal', 'owner', 'director', 'admin', 'super_admin', 'agency_admin']));

create policy knowledge_factory_uat_contract_check_events_admin_read
on public.knowledge_factory_uat_contract_check_events for select to authenticated
using (public.knowledge_factory_is_active_member(organisation_id, array['principal', 'owner', 'director', 'admin', 'super_admin', 'agency_admin']));

revoke all on function public.knowledge_factory_reject_uat_contract_check_event_mutation() from public;
comment on table public.knowledge_factory_uat_contract_checks is 'Phase 1 UAT contract discovery register. Stores field names and aggregated cost evidence only; raw supplier data and personal data are prohibited.';
comment on table public.knowledge_factory_uat_contract_check_events is 'Immutable audit history for controlled Knowledge Factory UAT contract discovery.';

commit;
