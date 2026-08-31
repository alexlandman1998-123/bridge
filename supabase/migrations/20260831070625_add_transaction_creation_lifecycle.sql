alter table public.transactions
  add column if not exists creation_status text,
  add column if not exists creation_started_at timestamptz,
  add column if not exists creation_completed_at timestamptz,
  add column if not exists creation_incomplete_at timestamptz,
  add column if not exists creation_steps jsonb,
  add column if not exists creation_error jsonb;

-- Rows created before the lifecycle existed are already-established matters.
-- New writes default to initializing and must be explicitly finalized by the
-- creation workflow.
update public.transactions
set
  creation_status = coalesce(creation_status, 'complete'),
  creation_started_at = coalesce(creation_started_at, created_at, now()),
  creation_completed_at = case
    when coalesce(creation_status, 'complete') = 'complete'
      then coalesce(creation_completed_at, updated_at, created_at, now())
    else creation_completed_at
  end,
  creation_incomplete_at = case
    when creation_status = 'incomplete'
      then coalesce(creation_incomplete_at, updated_at, created_at, now())
    else creation_incomplete_at
  end,
  creation_steps = coalesce(creation_steps, '{}'::jsonb),
  creation_error = coalesce(creation_error, '{}'::jsonb)
where
  creation_status is null
  or creation_started_at is null
  or creation_steps is null
  or creation_error is null
  or (creation_status = 'complete' and creation_completed_at is null)
  or (creation_status = 'incomplete' and creation_incomplete_at is null);

alter table public.transactions
  alter column creation_status set default 'initializing',
  alter column creation_status set not null,
  alter column creation_started_at set default now(),
  alter column creation_started_at set not null,
  alter column creation_steps set default '{}'::jsonb,
  alter column creation_steps set not null,
  alter column creation_error set default '{}'::jsonb,
  alter column creation_error set not null;

alter table public.transactions
  drop constraint if exists transactions_creation_status_check,
  add constraint transactions_creation_status_check
    check (creation_status in ('initializing', 'complete', 'incomplete')),
  drop constraint if exists transactions_creation_steps_object_check,
  add constraint transactions_creation_steps_object_check
    check (jsonb_typeof(creation_steps) = 'object'),
  drop constraint if exists transactions_creation_error_object_check,
  add constraint transactions_creation_error_object_check
    check (jsonb_typeof(creation_error) = 'object'),
  drop constraint if exists transactions_creation_terminal_timestamp_check,
  add constraint transactions_creation_terminal_timestamp_check
    check (
      (creation_status = 'initializing' and creation_completed_at is null and creation_incomplete_at is null)
      or (creation_status = 'complete' and creation_completed_at is not null and creation_incomplete_at is null)
      or (creation_status = 'incomplete' and creation_incomplete_at is not null and creation_completed_at is null)
    ),
  drop constraint if exists transactions_incomplete_creation_inactive_check,
  add constraint transactions_incomplete_creation_inactive_check
    check (creation_status = 'complete' or coalesce(is_active, false) = false);

create index if not exists transactions_creation_status_updated_idx
  on public.transactions (creation_status, updated_at desc);

comment on column public.transactions.creation_status is
  'Canonical creation lifecycle. A transaction is complete only after attorney assignment, onboarding snapshot, requirement generation, and required portal setup are verified.';
comment on column public.transactions.creation_steps is
  'Per-step creation outcomes for attorney_assignment, onboarding_snapshot, requirement_generation, and portal_setup.';
comment on column public.transactions.creation_error is
  'Sanitized failure metadata when creation_status is incomplete.';
