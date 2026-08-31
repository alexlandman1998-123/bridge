begin;

create table if not exists public.property24_live_cutover_gates (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null unique,
  status text not null default 'blocked',
  phase6_pack_status text,
  phase6_pack_generated_at timestamptz,
  phase6_pack_digest text,
  phase6_evidence_summary jsonb not null default '{}'::jsonb,
  pilot_listing_limit integer not null default 3,
  approved_by uuid,
  approved_at timestamptz,
  pilot_started_by uuid,
  pilot_started_at timestamptz,
  live_enabled_by uuid,
  live_enabled_at timestamptz,
  paused_by uuid,
  paused_at timestamptz,
  pause_reason text,
  last_reconciled_at timestamptz,
  last_reconciliation_status text,
  last_reconciliation_summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint property24_live_cutover_gates_status_check
    check (status in ('blocked', 'approved', 'pilot', 'paused', 'live')),
  constraint property24_live_cutover_gates_pilot_limit_check
    check (pilot_listing_limit between 1 and 3),
  constraint property24_live_cutover_gates_phase6_summary_check
    check (jsonb_typeof(phase6_evidence_summary) = 'object'),
  constraint property24_live_cutover_gates_reconciliation_summary_check
    check (jsonb_typeof(last_reconciliation_summary) = 'object')
);

create table if not exists public.property24_live_cutover_events (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  action text not null,
  previous_status text,
  next_status text not null,
  actor_user_id uuid not null,
  reason text not null,
  evidence_summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint property24_live_cutover_events_action_check
    check (action in ('approve_exdev', 'start_pilot', 'promote_live', 'pause', 'resume_pilot')),
  constraint property24_live_cutover_events_previous_status_check
    check (previous_status is null or previous_status in ('blocked', 'approved', 'pilot', 'paused', 'live')),
  constraint property24_live_cutover_events_next_status_check
    check (next_status in ('blocked', 'approved', 'pilot', 'paused', 'live')),
  constraint property24_live_cutover_events_evidence_check
    check (jsonb_typeof(evidence_summary) = 'object'),
  constraint property24_live_cutover_events_reason_check
    check (length(trim(reason)) >= 10)
);

create index if not exists property24_live_cutover_gates_status_idx
  on public.property24_live_cutover_gates(status, updated_at desc);

create index if not exists property24_live_cutover_events_org_created_idx
  on public.property24_live_cutover_events(organisation_id, created_at desc);

create or replace function public.property24_live_cutover_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_property24_live_cutover_gates_updated_at on public.property24_live_cutover_gates;
create trigger trg_property24_live_cutover_gates_updated_at
before update on public.property24_live_cutover_gates
for each row execute function public.property24_live_cutover_set_updated_at();

alter table public.property24_live_cutover_gates enable row level security;
alter table public.property24_live_cutover_events enable row level security;

revoke all on table public.property24_live_cutover_gates from anon, authenticated;
revoke all on table public.property24_live_cutover_events from anon, authenticated;
grant select, insert, update, delete on table public.property24_live_cutover_gates to service_role;
grant select, insert on table public.property24_live_cutover_events to service_role;

comment on table public.property24_live_cutover_gates is
  'Server-managed, organisation-scoped Property24 production cutover state. It cannot publish listings by itself.';

comment on table public.property24_live_cutover_events is
  'Append-only audit evidence for Property24 production cutover decisions.';

commit;
