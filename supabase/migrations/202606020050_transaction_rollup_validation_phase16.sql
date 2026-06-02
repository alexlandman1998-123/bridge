create table if not exists public.transaction_rollup_validation (
  id uuid primary key default gen_random_uuid(),
  transaction_id text not null unique,
  legacy_stage text,
  legacy_parent_stage text,
  rollup_stage text,
  legacy_status text,
  rollup_status text,
  legacy_progress_percent integer not null default 0,
  rollup_progress_percent integer not null default 0,
  comparison_status text not null default 'match',
  mismatch_category text,
  mismatch_reason text,
  exception_codes_json jsonb not null default '[]'::jsonb,
  legacy_snapshot_json jsonb not null default '{}'::jsonb,
  rollup_snapshot_json jsonb not null default '{}'::jsonb,
  validation_details_json jsonb not null default '{}'::jsonb,
  compared_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists transaction_rollup_validation_comparison_status_idx
  on public.transaction_rollup_validation (comparison_status, compared_at desc);

create index if not exists transaction_rollup_validation_mismatch_category_idx
  on public.transaction_rollup_validation (mismatch_category, compared_at desc);
