begin;

create extension if not exists "pgcrypto";

-- Arch9 keeps a permanent platform reference independently from each law
-- firm's filing reference. Phase 2 will populate this column.
alter table public.transactions
  add column if not exists platform_reference text;

alter table public.transactions
  drop constraint if exists transactions_platform_reference_not_blank_check;

alter table public.transactions
  add constraint transactions_platform_reference_not_blank_check
  check (platform_reference is null or nullif(btrim(platform_reference), '') is not null);

create unique index if not exists transactions_platform_reference_uidx
  on public.transactions (lower(btrim(platform_reference)))
  where platform_reference is not null;

comment on column public.transactions.platform_reference is
  'Immutable Arch9 reference. Firm-specific provisional and filing references live on attorney_matter_files.';

create or replace function public.protect_transaction_platform_reference()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.platform_reference is not null
    and new.platform_reference is distinct from old.platform_reference then
    raise exception 'The Arch9 platform reference cannot be changed once assigned.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_protect_transaction_platform_reference on public.transactions;
create trigger trg_protect_transaction_platform_reference
before update of platform_reference on public.transactions
for each row
execute function public.protect_transaction_platform_reference();

create table if not exists public.attorney_matter_files (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  attorney_firm_id uuid not null references public.attorney_firms(id) on delete cascade,
  lane text not null,
  provisional_reference text,
  filing_reference text,
  reference_status text not null default 'provisional',
  confirmed_at timestamptz,
  confirmed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint attorney_matter_files_lane_check
    check (lane in ('transfer', 'bond', 'cancellation')),
  constraint attorney_matter_files_provisional_reference_not_blank_check
    check (provisional_reference is null or nullif(btrim(provisional_reference), '') is not null),
  constraint attorney_matter_files_reference_status_check
    check (reference_status in ('provisional', 'confirmed')),
  constraint attorney_matter_files_confirmation_state_check
    check (
      (
        reference_status = 'provisional'
        and filing_reference is null
        and confirmed_at is null
        and confirmed_by is null
      )
      or (
        reference_status = 'confirmed'
        and nullif(btrim(filing_reference), '') is not null
        and confirmed_at is not null
        and confirmed_by is not null
      )
    ),
  constraint attorney_matter_files_transaction_firm_lane_unique
    unique (transaction_id, attorney_firm_id, lane)
);

create unique index if not exists attorney_matter_files_firm_filing_reference_uidx
  on public.attorney_matter_files (attorney_firm_id, lower(btrim(filing_reference)))
  where filing_reference is not null;

create index if not exists attorney_matter_files_transaction_idx
  on public.attorney_matter_files (transaction_id);

create index if not exists attorney_matter_files_firm_lane_status_idx
  on public.attorney_matter_files (attorney_firm_id, lane, reference_status);

create index if not exists attorney_matter_files_firm_provisional_reference_idx
  on public.attorney_matter_files (attorney_firm_id, lower(btrim(provisional_reference)))
  where provisional_reference is not null;

comment on table public.attorney_matter_files is
  'Firm- and lane-specific legal files linked to a shared Arch9 transaction.';
comment on column public.attorney_matter_files.provisional_reference is
  'Automatically generated firm reference until the filing number is confirmed.';
comment on column public.attorney_matter_files.filing_reference is
  'Firm-confirmed filing-system reference. Unique within the attorney firm, case-insensitively.';

create table if not exists public.attorney_matter_number_settings (
  id uuid primary key default gen_random_uuid(),
  attorney_firm_id uuid not null references public.attorney_firms(id) on delete cascade,
  lane text not null default 'all',
  prefix text not null default 'MAT',
  suffix text,
  separator text not null default '-',
  include_year boolean not null default true,
  year_format text not null default 'YYYY',
  sequence_padding smallint not null default 6,
  reset_frequency text not null default 'annual',
  enabled boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint attorney_matter_number_settings_firm_lane_unique
    unique (attorney_firm_id, lane),
  constraint attorney_matter_number_settings_lane_check
    check (lane in ('all', 'transfer', 'bond', 'cancellation')),
  constraint attorney_matter_number_settings_prefix_check
    check (nullif(btrim(prefix), '') is not null and char_length(prefix) <= 32),
  constraint attorney_matter_number_settings_suffix_check
    check (suffix is null or (nullif(btrim(suffix), '') is not null and char_length(suffix) <= 32)),
  constraint attorney_matter_number_settings_separator_check
    check (char_length(separator) between 0 and 5),
  constraint attorney_matter_number_settings_year_format_check
    check (year_format in ('YYYY', 'YY')),
  constraint attorney_matter_number_settings_sequence_padding_check
    check (sequence_padding between 1 and 12),
  constraint attorney_matter_number_settings_reset_frequency_check
    check (reset_frequency in ('annual', 'continuous'))
);

create index if not exists attorney_matter_number_settings_firm_enabled_idx
  on public.attorney_matter_number_settings (attorney_firm_id, enabled);

comment on table public.attorney_matter_number_settings is
  'Firm numbering templates. The all lane is the fallback for lane-specific settings.';

create table if not exists public.attorney_matter_reference_sequences (
  attorney_firm_id uuid not null references public.attorney_firms(id) on delete cascade,
  lane text not null,
  sequence_year integer not null,
  last_value bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (attorney_firm_id, lane, sequence_year),
  constraint attorney_matter_reference_sequences_lane_check
    check (lane in ('transfer', 'bond', 'cancellation')),
  constraint attorney_matter_reference_sequences_year_check
    check (sequence_year between 0 and 9999),
  constraint attorney_matter_reference_sequences_last_value_check
    check (last_value >= 0)
);

comment on table public.attorney_matter_reference_sequences is
  'Atomic counters scoped to firm, lane, and numbering period. sequence_year 0 represents a continuous sequence.';

create table if not exists public.attorney_matter_reference_history (
  id uuid primary key default gen_random_uuid(),
  attorney_matter_file_id uuid not null references public.attorney_matter_files(id) on delete cascade,
  previous_reference text,
  new_reference text,
  change_type text not null,
  change_reason text,
  changed_by uuid references auth.users(id) on delete set null,
  changed_at timestamptz not null default now(),
  constraint attorney_matter_reference_history_change_type_check
    check (change_type in ('generated', 'confirmed', 'changed', 'cleared', 'backfilled')),
  constraint attorney_matter_reference_history_reference_check
    check (
      nullif(btrim(previous_reference), '') is not null
      or nullif(btrim(new_reference), '') is not null
    )
);

create index if not exists attorney_matter_reference_history_file_changed_idx
  on public.attorney_matter_reference_history (attorney_matter_file_id, changed_at desc);

create index if not exists attorney_matter_reference_history_previous_reference_idx
  on public.attorney_matter_reference_history (lower(btrim(previous_reference)))
  where previous_reference is not null;

create index if not exists attorney_matter_reference_history_new_reference_idx
  on public.attorney_matter_reference_history (lower(btrim(new_reference)))
  where new_reference is not null;

comment on table public.attorney_matter_reference_history is
  'Immutable audit and search aliases for generated, confirmed, and changed firm matter references.';

drop trigger if exists trg_attorney_matter_files_updated_at on public.attorney_matter_files;
create trigger trg_attorney_matter_files_updated_at
before update on public.attorney_matter_files
for each row execute function public.set_updated_at_timestamp();

drop trigger if exists trg_attorney_matter_number_settings_updated_at on public.attorney_matter_number_settings;
create trigger trg_attorney_matter_number_settings_updated_at
before update on public.attorney_matter_number_settings
for each row execute function public.set_updated_at_timestamp();

drop trigger if exists trg_attorney_matter_reference_sequences_updated_at on public.attorney_matter_reference_sequences;
create trigger trg_attorney_matter_reference_sequences_updated_at
before update on public.attorney_matter_reference_sequences
for each row execute function public.set_updated_at_timestamp();

-- A firm lead can manage every file in the firm. Other active members must be
-- assigned to the matching transaction lane and retain edit permission.
create or replace function public.attorney_user_can_manage_matter_file(
  target_firm_id uuid,
  target_transaction_id uuid,
  target_lane text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.bridge_can_access_transaction_spine(target_transaction_id)
    and (
      public.attorney_user_is_firm_lead(target_firm_id)
      or exists (
        select 1
        from public.attorney_firm_members member
        join public.transaction_attorney_assignments assignment
          on coalesce(assignment.attorney_firm_id, assignment.firm_id) = member.firm_id
         and assignment.transaction_id = target_transaction_id
        where member.firm_id = target_firm_id
          and member.user_id = auth.uid()
          and member.status = 'active'
          and coalesce(assignment.assignment_status, assignment.status) = 'active'
          and assignment.can_edit is distinct from false
          and auth.uid() in (
            assignment.attorney_user_id,
            assignment.primary_attorney_id,
            assignment.secretary_id,
            assignment.admin_handler_id
          )
          and (
            (target_lane = 'transfer' and assignment.assignment_type in ('transfer', 'transfer_and_bond'))
            or (target_lane = 'bond' and assignment.assignment_type in ('bond', 'transfer_and_bond'))
            or (target_lane = 'cancellation' and assignment.assignment_type = 'cancellation')
          )
      )
    );
$$;

revoke all on function public.attorney_user_can_manage_matter_file(uuid, uuid, text) from public;
grant execute on function public.attorney_user_can_manage_matter_file(uuid, uuid, text) to authenticated;

alter table public.attorney_matter_files enable row level security;
alter table public.attorney_matter_number_settings enable row level security;
alter table public.attorney_matter_reference_sequences enable row level security;
alter table public.attorney_matter_reference_history enable row level security;

drop policy if exists attorney_matter_files_select_scoped on public.attorney_matter_files;
create policy attorney_matter_files_select_scoped
  on public.attorney_matter_files
  for select
  to authenticated
  using (
    public.attorney_user_is_active_member(attorney_firm_id)
    and public.bridge_can_access_transaction_spine(transaction_id)
  );

drop policy if exists attorney_matter_files_insert_scoped on public.attorney_matter_files;
create policy attorney_matter_files_insert_scoped
  on public.attorney_matter_files
  for insert
  to authenticated
  with check (
    public.attorney_user_can_manage_matter_file(attorney_firm_id, transaction_id, lane)
  );

drop policy if exists attorney_matter_files_update_scoped on public.attorney_matter_files;
create policy attorney_matter_files_update_scoped
  on public.attorney_matter_files
  for update
  to authenticated
  using (
    public.attorney_user_can_manage_matter_file(attorney_firm_id, transaction_id, lane)
  )
  with check (
    public.attorney_user_can_manage_matter_file(attorney_firm_id, transaction_id, lane)
  );

drop policy if exists attorney_matter_number_settings_select_member on public.attorney_matter_number_settings;
create policy attorney_matter_number_settings_select_member
  on public.attorney_matter_number_settings
  for select
  to authenticated
  using (public.attorney_user_is_active_member(attorney_firm_id));

drop policy if exists attorney_matter_number_settings_insert_lead on public.attorney_matter_number_settings;
create policy attorney_matter_number_settings_insert_lead
  on public.attorney_matter_number_settings
  for insert
  to authenticated
  with check (
    public.attorney_user_is_firm_lead(attorney_firm_id)
    and (created_by is null or created_by = auth.uid())
    and (updated_by is null or updated_by = auth.uid())
  );

drop policy if exists attorney_matter_number_settings_update_lead on public.attorney_matter_number_settings;
create policy attorney_matter_number_settings_update_lead
  on public.attorney_matter_number_settings
  for update
  to authenticated
  using (public.attorney_user_is_firm_lead(attorney_firm_id))
  with check (
    public.attorney_user_is_firm_lead(attorney_firm_id)
    and (updated_by is null or updated_by = auth.uid())
  );

drop policy if exists attorney_matter_reference_sequences_select_lead on public.attorney_matter_reference_sequences;
create policy attorney_matter_reference_sequences_select_lead
  on public.attorney_matter_reference_sequences
  for select
  to authenticated
  using (public.attorney_user_is_firm_lead(attorney_firm_id));

drop policy if exists attorney_matter_reference_history_select_scoped on public.attorney_matter_reference_history;
create policy attorney_matter_reference_history_select_scoped
  on public.attorney_matter_reference_history
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.attorney_matter_files matter_file
      where matter_file.id = attorney_matter_reference_history.attorney_matter_file_id
    )
  );

drop policy if exists attorney_matter_reference_history_insert_scoped on public.attorney_matter_reference_history;
create policy attorney_matter_reference_history_insert_scoped
  on public.attorney_matter_reference_history
  for insert
  to authenticated
  with check (
    changed_by = auth.uid()
    and exists (
      select 1
      from public.attorney_matter_files matter_file
      where matter_file.id = attorney_matter_reference_history.attorney_matter_file_id
        and public.attorney_user_can_manage_matter_file(
          matter_file.attorney_firm_id,
          matter_file.transaction_id,
          matter_file.lane
        )
    )
  );

grant select, insert, update on public.attorney_matter_files to authenticated;
grant select, insert, update on public.attorney_matter_number_settings to authenticated;
grant select on public.attorney_matter_reference_sequences to authenticated;
grant select, insert on public.attorney_matter_reference_history to authenticated;

notify pgrst, 'reload schema';

commit;
