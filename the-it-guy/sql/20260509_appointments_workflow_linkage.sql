-- Phase 2: Workflow-linked appointment coordination fields

alter table if exists public.appointments add column if not exists linked_workflow text;
alter table if exists public.appointments add column if not exists linked_workflow_stage text;
alter table if exists public.appointments add column if not exists linked_task_id uuid;
alter table if exists public.appointments add column if not exists linked_transaction_stage text;
alter table if exists public.appointments add column if not exists workflow_completion_effect jsonb not null default '{}'::jsonb;
alter table if exists public.appointments add column if not exists visibility_scope text not null default 'shared_role_players';
alter table if exists public.appointments add column if not exists completion_behavior text;
alter table if exists public.appointments add column if not exists appointment_instructions text;
alter table if exists public.appointments add column if not exists required_documents jsonb not null default '[]'::jsonb;

alter table if exists public.appointments drop constraint if exists appointments_visibility_scope_check;
alter table if exists public.appointments
  add constraint appointments_visibility_scope_check
  check (visibility_scope in ('client_visible', 'internal_only', 'shared_role_players'));

create index if not exists appointments_workflow_stage_idx on public.appointments (linked_workflow_stage);
create index if not exists appointments_visibility_scope_idx on public.appointments (visibility_scope);
