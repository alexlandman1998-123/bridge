begin;

create table if not exists public.transaction_workflow_instances (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  workflow_key text not null,
  workflow_version integer not null default 1,
  status text not null default 'not_started',
  started_at timestamptz,
  completed_at timestamptz,
  skipped_at timestamptz,
  blocked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transaction_workflow_instances_status_check
    check (status in ('not_started', 'active', 'blocked', 'ready_for_handoff', 'complete', 'skipped', 'cancelled')),
  constraint transaction_workflow_instances_unique unique (transaction_id, workflow_key)
);

create table if not exists public.transaction_workflow_steps (
  id uuid primary key default gen_random_uuid(),
  workflow_instance_id uuid not null references public.transaction_workflow_instances(id) on delete cascade,
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  workflow_key text not null,
  step_key text not null,
  step_label text not null,
  status text not null default 'not_started',
  required boolean not null default true,
  blocking boolean not null default false,
  owner_role text not null default 'system',
  sort_order integer not null default 0,
  completed_at timestamptz,
  completed_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transaction_workflow_steps_status_check
    check (status in ('not_started', 'pending', 'blocked', 'complete', 'skipped', 'not_applicable')),
  constraint transaction_workflow_steps_unique unique (workflow_instance_id, step_key)
);

create table if not exists public.transaction_workflow_evidence (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  workflow_step_id uuid not null references public.transaction_workflow_steps(id) on delete cascade,
  workflow_key text not null,
  step_key text not null,
  evidence_type text not null,
  evidence_id text not null default '',
  evidence_status text not null default 'observed',
  created_at timestamptz not null default now(),
  constraint transaction_workflow_evidence_type_check
    check (evidence_type in ('document', 'event', 'checklist_item', 'document_request', 'manual_override')),
  constraint transaction_workflow_evidence_status_check
    check (evidence_status in ('observed', 'accepted', 'rejected', 'superseded')),
  constraint transaction_workflow_evidence_unique unique (workflow_step_id, evidence_type, evidence_id)
);

create table if not exists public.transaction_rollups (
  transaction_id uuid primary key references public.transactions(id) on delete cascade,
  parent_stage text not null,
  parent_status text not null,
  progress_percent integer not null default 0,
  active_workflow_key text,
  active_step_key text,
  completed_stages_json jsonb not null default '[]'::jsonb,
  blocked_stages_json jsonb not null default '[]'::jsonb,
  blockers_json jsonb not null default '[]'::jsonb,
  next_action_json jsonb,
  derived_from_json jsonb not null default '{}'::jsonb,
  derived_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transaction_rollups_parent_stage_check
    check (parent_stage in ('SETUP', 'SALES_OTP', 'FINANCE', 'TRANSFER', 'REGISTRATION', 'COMPLETE', 'CANCELLED')),
  constraint transaction_rollups_parent_status_check
    check (parent_status in ('not_started', 'active', 'blocked', 'ready_for_handoff', 'complete', 'cancelled'))
);

create table if not exists public.transaction_rollup_audit (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  previous_parent_stage text,
  new_parent_stage text,
  previous_parent_status text,
  new_parent_status text,
  reason_code text not null,
  trigger_type text not null,
  trigger_id text,
  derived_from_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  created_by uuid
);

create index if not exists transaction_workflow_instances_transaction_idx
  on public.transaction_workflow_instances (transaction_id, workflow_key, status);

create index if not exists transaction_workflow_steps_transaction_idx
  on public.transaction_workflow_steps (transaction_id, workflow_key, sort_order);

create index if not exists transaction_workflow_steps_instance_idx
  on public.transaction_workflow_steps (workflow_instance_id, status, sort_order);

create index if not exists transaction_workflow_evidence_transaction_idx
  on public.transaction_workflow_evidence (transaction_id, workflow_key, step_key);

create index if not exists transaction_rollups_stage_idx
  on public.transaction_rollups (parent_stage, parent_status, derived_at desc);

create index if not exists transaction_rollup_audit_transaction_idx
  on public.transaction_rollup_audit (transaction_id, created_at desc);

create index if not exists transaction_rollup_audit_reason_idx
  on public.transaction_rollup_audit (reason_code, trigger_type, created_at desc);

drop trigger if exists transaction_workflow_instances_set_updated_at on public.transaction_workflow_instances;
create trigger transaction_workflow_instances_set_updated_at
before update on public.transaction_workflow_instances
for each row
execute function public.bridge_set_updated_at();

drop trigger if exists transaction_workflow_steps_set_updated_at on public.transaction_workflow_steps;
create trigger transaction_workflow_steps_set_updated_at
before update on public.transaction_workflow_steps
for each row
execute function public.bridge_set_updated_at();

drop trigger if exists transaction_rollups_set_updated_at on public.transaction_rollups;
create trigger transaction_rollups_set_updated_at
before update on public.transaction_rollups
for each row
execute function public.bridge_set_updated_at();

alter table if exists public.transaction_workflow_instances enable row level security;
alter table if exists public.transaction_workflow_steps enable row level security;
alter table if exists public.transaction_workflow_evidence enable row level security;
alter table if exists public.transaction_rollups enable row level security;
alter table if exists public.transaction_rollup_audit enable row level security;

drop policy if exists transaction_workflow_instances_select_transaction_scope on public.transaction_workflow_instances;
create policy transaction_workflow_instances_select_transaction_scope
  on public.transaction_workflow_instances
  for select
  to authenticated
  using (public.bridge_can_access_transaction_spine(transaction_id));

drop policy if exists transaction_workflow_instances_insert_transaction_scope on public.transaction_workflow_instances;
create policy transaction_workflow_instances_insert_transaction_scope
  on public.transaction_workflow_instances
  for insert
  to authenticated
  with check (public.bridge_can_access_transaction_spine(transaction_id));

drop policy if exists transaction_workflow_instances_update_transaction_scope on public.transaction_workflow_instances;
create policy transaction_workflow_instances_update_transaction_scope
  on public.transaction_workflow_instances
  for update
  to authenticated
  using (public.bridge_can_access_transaction_spine(transaction_id))
  with check (public.bridge_can_access_transaction_spine(transaction_id));

drop policy if exists transaction_workflow_steps_select_transaction_scope on public.transaction_workflow_steps;
create policy transaction_workflow_steps_select_transaction_scope
  on public.transaction_workflow_steps
  for select
  to authenticated
  using (public.bridge_can_access_transaction_spine(transaction_id));

drop policy if exists transaction_workflow_steps_insert_transaction_scope on public.transaction_workflow_steps;
create policy transaction_workflow_steps_insert_transaction_scope
  on public.transaction_workflow_steps
  for insert
  to authenticated
  with check (public.bridge_can_access_transaction_spine(transaction_id));

drop policy if exists transaction_workflow_steps_update_transaction_scope on public.transaction_workflow_steps;
create policy transaction_workflow_steps_update_transaction_scope
  on public.transaction_workflow_steps
  for update
  to authenticated
  using (public.bridge_can_access_transaction_spine(transaction_id))
  with check (public.bridge_can_access_transaction_spine(transaction_id));

drop policy if exists transaction_workflow_evidence_select_transaction_scope on public.transaction_workflow_evidence;
create policy transaction_workflow_evidence_select_transaction_scope
  on public.transaction_workflow_evidence
  for select
  to authenticated
  using (public.bridge_can_access_transaction_spine(transaction_id));

drop policy if exists transaction_workflow_evidence_insert_transaction_scope on public.transaction_workflow_evidence;
create policy transaction_workflow_evidence_insert_transaction_scope
  on public.transaction_workflow_evidence
  for insert
  to authenticated
  with check (public.bridge_can_access_transaction_spine(transaction_id));

drop policy if exists transaction_workflow_evidence_update_transaction_scope on public.transaction_workflow_evidence;
create policy transaction_workflow_evidence_update_transaction_scope
  on public.transaction_workflow_evidence
  for update
  to authenticated
  using (public.bridge_can_access_transaction_spine(transaction_id))
  with check (public.bridge_can_access_transaction_spine(transaction_id));

drop policy if exists transaction_rollups_select_transaction_scope on public.transaction_rollups;
create policy transaction_rollups_select_transaction_scope
  on public.transaction_rollups
  for select
  to authenticated
  using (public.bridge_can_access_transaction_spine(transaction_id));

drop policy if exists transaction_rollups_insert_transaction_scope on public.transaction_rollups;
create policy transaction_rollups_insert_transaction_scope
  on public.transaction_rollups
  for insert
  to authenticated
  with check (public.bridge_can_access_transaction_spine(transaction_id));

drop policy if exists transaction_rollups_update_transaction_scope on public.transaction_rollups;
create policy transaction_rollups_update_transaction_scope
  on public.transaction_rollups
  for update
  to authenticated
  using (public.bridge_can_access_transaction_spine(transaction_id))
  with check (public.bridge_can_access_transaction_spine(transaction_id));

drop policy if exists transaction_rollup_audit_select_transaction_scope on public.transaction_rollup_audit;
create policy transaction_rollup_audit_select_transaction_scope
  on public.transaction_rollup_audit
  for select
  to authenticated
  using (public.bridge_can_access_transaction_spine(transaction_id));

drop policy if exists transaction_rollup_audit_insert_transaction_scope on public.transaction_rollup_audit;
create policy transaction_rollup_audit_insert_transaction_scope
  on public.transaction_rollup_audit
  for insert
  to authenticated
  with check (public.bridge_can_access_transaction_spine(transaction_id));

grant select, insert, update on public.transaction_workflow_instances to authenticated;
grant select, insert, update on public.transaction_workflow_steps to authenticated;
grant select, insert, update on public.transaction_workflow_evidence to authenticated;
grant select, insert, update on public.transaction_rollups to authenticated;
grant select, insert on public.transaction_rollup_audit to authenticated;

comment on table public.transaction_workflow_instances is
  'Canonical workflow lane instances per transaction for the Transaction Workspace roll-up engine.';
comment on table public.transaction_workflow_steps is
  'Normalized workflow steps per canonical workflow lane.';
comment on table public.transaction_workflow_evidence is
  'Structured evidence links between workflow steps and supporting documents, events, checklists, or overrides.';
comment on table public.transaction_rollups is
  'Cached canonical Transaction Workspace overview derived from workflow instances, steps, and evidence.';
comment on table public.transaction_rollup_audit is
  'Audit trail describing why a canonical transaction roll-up changed.';

notify pgrst, 'reload schema';

commit;
