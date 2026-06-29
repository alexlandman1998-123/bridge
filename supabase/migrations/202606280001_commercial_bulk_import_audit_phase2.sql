begin;

create extension if not exists "pgcrypto";

create table if not exists public.commercial_import_batches (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  branch_id uuid references public.organisation_branches(id) on delete set null,
  team_id uuid references public.commercial_teams(id) on delete set null,
  broker_id uuid references auth.users(id) on delete set null,
  record_type text not null,
  source_type text not null default 'spreadsheet',
  file_name text,
  file_mime_type text,
  file_size bigint,
  storage_bucket text,
  storage_path text,
  status text not null default 'uploaded',
  duplicate_strategy text not null default 'review',
  default_owner_mode text not null default 'uploading_broker',
  requires_manager_approval boolean not null default true,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  rejected_by uuid references auth.users(id) on delete set null,
  rejected_at timestamptz,
  rejection_notes text,
  committed_by uuid references auth.users(id) on delete set null,
  committed_at timestamptz,
  total_rows integer not null default 0,
  valid_rows integer not null default 0,
  invalid_rows integer not null default 0,
  warning_rows integer not null default 0,
  created_count integer not null default 0,
  updated_count integer not null default 0,
  skipped_count integer not null default 0,
  failed_count integer not null default 0,
  settings_snapshot jsonb not null default '{}'::jsonb,
  column_mapping jsonb not null default '{}'::jsonb,
  validation_summary jsonb not null default '{}'::jsonb,
  import_summary jsonb not null default '{}'::jsonb,
  metadata_json jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint commercial_import_batches_record_type_check
    check (record_type in (
      'vacancies',
      'leads',
      'requirements',
      'canvassing_landlord_prospects',
      'canvassing_tenant_prospects',
      'properties',
      'landlords',
      'companies',
      'contacts',
      'listings'
    )),
  constraint commercial_import_batches_source_type_check
    check (source_type in ('spreadsheet', 'csv', 'xlsx', 'manual', 'api')),
  constraint commercial_import_batches_status_check
    check (status in (
      'uploaded',
      'mapped',
      'validated',
      'ready',
      'approval_pending',
      'approved',
      'committing',
      'committed',
      'failed',
      'cancelled',
      'rejected'
    )),
  constraint commercial_import_batches_duplicate_strategy_check
    check (duplicate_strategy in ('review', 'skip', 'update')),
  constraint commercial_import_batches_default_owner_mode_check
    check (default_owner_mode in ('uploading_broker', 'selected_broker', 'unassigned')),
  constraint commercial_import_batches_row_counts_check
    check (
      total_rows >= 0
      and valid_rows >= 0
      and invalid_rows >= 0
      and warning_rows >= 0
      and created_count >= 0
      and updated_count >= 0
      and skipped_count >= 0
      and failed_count >= 0
    )
);

create table if not exists public.commercial_import_rows (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.commercial_import_batches(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  branch_id uuid references public.organisation_branches(id) on delete set null,
  team_id uuid references public.commercial_teams(id) on delete set null,
  broker_id uuid references auth.users(id) on delete set null,
  row_number integer not null,
  source_row jsonb not null default '{}'::jsonb,
  mapped_payload jsonb not null default '{}'::jsonb,
  normalized_payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  action text not null default 'none',
  validation_errors jsonb not null default '[]'::jsonb,
  validation_warnings jsonb not null default '[]'::jsonb,
  duplicate_key text,
  duplicate_record_type text,
  duplicate_record_id uuid,
  target_table text,
  target_record_id uuid,
  error_message text,
  processed_at timestamptz,
  metadata_json jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint commercial_import_rows_batch_row_unique unique (batch_id, row_number),
  constraint commercial_import_rows_row_number_check check (row_number > 0),
  constraint commercial_import_rows_status_check
    check (status in (
      'pending',
      'mapped',
      'valid',
      'invalid',
      'warning',
      'ready',
      'committing',
      'created',
      'updated',
      'skipped',
      'failed'
    )),
  constraint commercial_import_rows_action_check
    check (action in ('none', 'create', 'update', 'skip', 'review')),
  constraint commercial_import_rows_validation_errors_array_check
    check (jsonb_typeof(validation_errors) = 'array'),
  constraint commercial_import_rows_validation_warnings_array_check
    check (jsonb_typeof(validation_warnings) = 'array')
);

create index if not exists commercial_import_batches_org_status_idx
  on public.commercial_import_batches (organisation_id, status, created_at desc);
create index if not exists commercial_import_batches_record_type_idx
  on public.commercial_import_batches (organisation_id, record_type, created_at desc);
create index if not exists commercial_import_batches_hierarchy_idx
  on public.commercial_import_batches (organisation_id, branch_id, team_id, broker_id);
create index if not exists commercial_import_batches_created_by_idx
  on public.commercial_import_batches (organisation_id, created_by, created_at desc);

create index if not exists commercial_import_rows_batch_status_idx
  on public.commercial_import_rows (batch_id, status, row_number);
create index if not exists commercial_import_rows_org_status_idx
  on public.commercial_import_rows (organisation_id, status, created_at desc);
create index if not exists commercial_import_rows_duplicate_idx
  on public.commercial_import_rows (batch_id, duplicate_key)
  where duplicate_key is not null;
create index if not exists commercial_import_rows_target_record_idx
  on public.commercial_import_rows (target_table, target_record_id)
  where target_record_id is not null;

drop trigger if exists trg_bridge_touch_commercial_import_batches_updated_at on public.commercial_import_batches;
create trigger trg_bridge_touch_commercial_import_batches_updated_at
before update on public.commercial_import_batches
for each row execute function public.bridge_touch_commercial_updated_at();

drop trigger if exists trg_bridge_touch_commercial_import_rows_updated_at on public.commercial_import_rows;
create trigger trg_bridge_touch_commercial_import_rows_updated_at
before update on public.commercial_import_rows
for each row execute function public.bridge_touch_commercial_updated_at();

alter table public.commercial_import_batches enable row level security;
alter table public.commercial_import_rows enable row level security;

drop policy if exists commercial_import_batches_brokerage_select on public.commercial_import_batches;
create policy commercial_import_batches_brokerage_select
on public.commercial_import_batches
for select
to authenticated
using (public.bridge_commercial_can_access_record(organisation_id, branch_id, team_id, broker_id, created_by));

drop policy if exists commercial_import_batches_brokerage_insert on public.commercial_import_batches;
create policy commercial_import_batches_brokerage_insert
on public.commercial_import_batches
for insert
to authenticated
with check (exists (select 1 from public.bridge_commercial_user_scope(organisation_id)));

drop policy if exists commercial_import_batches_brokerage_update on public.commercial_import_batches;
create policy commercial_import_batches_brokerage_update
on public.commercial_import_batches
for update
to authenticated
using (public.bridge_commercial_can_access_record(organisation_id, branch_id, team_id, broker_id, created_by))
with check (public.bridge_commercial_can_access_record(organisation_id, branch_id, team_id, broker_id, created_by));

drop policy if exists commercial_import_batches_brokerage_delete on public.commercial_import_batches;
create policy commercial_import_batches_brokerage_delete
on public.commercial_import_batches
for delete
to authenticated
using (public.bridge_commercial_can_access_record(organisation_id, branch_id, team_id, broker_id, created_by));

drop policy if exists commercial_import_rows_brokerage_select on public.commercial_import_rows;
create policy commercial_import_rows_brokerage_select
on public.commercial_import_rows
for select
to authenticated
using (exists (
  select 1
  from public.commercial_import_batches batch
  where batch.id = commercial_import_rows.batch_id
    and batch.organisation_id = commercial_import_rows.organisation_id
    and public.bridge_commercial_can_access_record(batch.organisation_id, batch.branch_id, batch.team_id, batch.broker_id, batch.created_by)
));

drop policy if exists commercial_import_rows_brokerage_insert on public.commercial_import_rows;
create policy commercial_import_rows_brokerage_insert
on public.commercial_import_rows
for insert
to authenticated
with check (exists (
  select 1
  from public.commercial_import_batches batch
  where batch.id = commercial_import_rows.batch_id
    and batch.organisation_id = commercial_import_rows.organisation_id
    and public.bridge_commercial_can_access_record(batch.organisation_id, batch.branch_id, batch.team_id, batch.broker_id, batch.created_by)
));

drop policy if exists commercial_import_rows_brokerage_update on public.commercial_import_rows;
create policy commercial_import_rows_brokerage_update
on public.commercial_import_rows
for update
to authenticated
using (exists (
  select 1
  from public.commercial_import_batches batch
  where batch.id = commercial_import_rows.batch_id
    and batch.organisation_id = commercial_import_rows.organisation_id
    and public.bridge_commercial_can_access_record(batch.organisation_id, batch.branch_id, batch.team_id, batch.broker_id, batch.created_by)
))
with check (exists (
  select 1
  from public.commercial_import_batches batch
  where batch.id = commercial_import_rows.batch_id
    and batch.organisation_id = commercial_import_rows.organisation_id
    and public.bridge_commercial_can_access_record(batch.organisation_id, batch.branch_id, batch.team_id, batch.broker_id, batch.created_by)
));

drop policy if exists commercial_import_rows_brokerage_delete on public.commercial_import_rows;
create policy commercial_import_rows_brokerage_delete
on public.commercial_import_rows
for delete
to authenticated
using (exists (
  select 1
  from public.commercial_import_batches batch
  where batch.id = commercial_import_rows.batch_id
    and batch.organisation_id = commercial_import_rows.organisation_id
    and public.bridge_commercial_can_access_record(batch.organisation_id, batch.branch_id, batch.team_id, batch.broker_id, batch.created_by)
));

grant select, insert, update, delete on public.commercial_import_batches to authenticated;
grant select, insert, update, delete on public.commercial_import_rows to authenticated;

notify pgrst, 'reload schema';

commit;
