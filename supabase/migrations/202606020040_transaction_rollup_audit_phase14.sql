create table if not exists public.transaction_rollup_audit (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  previous_parent_stage text,
  new_parent_stage text,
  previous_parent_status text,
  new_parent_status text,
  previous_progress_percent numeric,
  new_progress_percent numeric,
  reason_code text,
  trigger_type text,
  trigger_id text,
  trigger_source text,
  derived_from_json jsonb not null default '{}'::jsonb,
  blockers_json jsonb not null default '[]'::jsonb,
  created_by uuid,
  created_at timestamptz not null default timezone('utc'::text, now())
);

alter table if exists public.transaction_rollup_audit
  add column if not exists previous_progress_percent numeric;

alter table if exists public.transaction_rollup_audit
  add column if not exists new_progress_percent numeric;

alter table if exists public.transaction_rollup_audit
  add column if not exists trigger_source text;

alter table if exists public.transaction_rollup_audit
  add column if not exists blockers_json jsonb not null default '[]'::jsonb;

alter table if exists public.transaction_rollup_audit
  add column if not exists derived_from_json jsonb not null default '{}'::jsonb;

create index if not exists transaction_rollup_audit_transaction_id_idx
  on public.transaction_rollup_audit (transaction_id, created_at desc);
