create extension if not exists "pgcrypto";

-- Ensure core tables exist (safe if already present)
create table if not exists developments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

create table if not exists units (
  id uuid primary key default gen_random_uuid(),
  development_id uuid not null references developments(id) on delete cascade,
  unit_number text not null,
  price numeric(12, 2) not null default 0,
  status text not null default 'Available',
  unique (development_id, unit_number)
);

create table if not exists buyers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  email text
);

create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references units(id) on delete cascade,
  buyer_id uuid references buyers(id) on delete set null,
  finance_type text not null default 'cash',
  stage text not null default 'Available',
  attorney text,
  bond_originator text,
  next_action text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists notes (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid references transactions(id) on delete cascade,
  body text,
  created_at timestamptz not null default now()
);

create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid references transactions(id) on delete cascade,
  name text,
  file_path text,
  category text default 'General',
  created_at timestamptz not null default now()
);

create table if not exists document_requirements (
  id uuid primary key default gen_random_uuid(),
  development_id uuid references developments(id) on delete cascade,
  category_key text not null,
  label text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- Add missing columns introduced by MVP
alter table transactions add column if not exists finance_type text default 'cash';
alter table transactions add column if not exists attorney text;
alter table transactions add column if not exists bond_originator text;
alter table transactions add column if not exists next_action text;
alter table transactions add column if not exists updated_at timestamptz default now();

alter table notes add column if not exists transaction_id uuid references transactions(id) on delete cascade;
alter table notes add column if not exists body text;

alter table documents add column if not exists transaction_id uuid references transactions(id) on delete cascade;
alter table documents add column if not exists name text;
alter table documents add column if not exists category text default 'General';

-- Relax legacy NOT NULL constraints so MVP columns can be used safely.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'notes' and column_name = 'unit_id'
  ) then
    execute 'alter table notes alter column unit_id drop not null';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'notes' and column_name = 'content'
  ) then
    execute 'alter table notes alter column content drop not null';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'documents' and column_name = 'unit_id'
  ) then
    execute 'alter table documents alter column unit_id drop not null';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'documents' and column_name = 'file_name'
  ) then
    execute 'alter table documents alter column file_name drop not null';
  end if;
end $$;

-- Backfill transactions defaults
update transactions
set finance_type = coalesce(finance_type, 'cash');

update transactions
set updated_at = coalesce(updated_at, created_at, now());

-- Normalize old stage values to new stage set
update transactions
set stage = case
  when stage in (
    'Available',
    'Reserved',
    'OTP Signed',
    'Deposit Paid',
    'Finance Pending',
    'Bond Approved / Proof of Funds',
    'Proceed to Attorneys',
    'Transfer in Progress',
    'Transfer Lodged',
    'Registered'
  ) then stage
  when stage = 'Bond Approved' then 'Bond Approved / Proof of Funds'
  when stage = 'Transfer' then 'Transfer in Progress'
  else 'Available'
end;

-- If units have no transaction yet, create one from unit status
insert into transactions (
  unit_id,
  stage,
  finance_type,
  created_at,
  updated_at
)
select
  u.id,
  case
    when u.status in (
      'Available',
      'Reserved',
      'OTP Signed',
      'Deposit Paid',
      'Finance Pending',
      'Bond Approved / Proof of Funds',
      'Proceed to Attorneys',
      'Transfer in Progress',
      'Transfer Lodged',
      'Registered'
    ) then u.status
    when u.status = 'Bond Approved' then 'Bond Approved / Proof of Funds'
    when u.status = 'Transfer' then 'Transfer in Progress'
    else 'Available'
  end,
  'cash',
  now(),
  now()
from units u
where not exists (
  select 1 from transactions t where t.unit_id = u.id
);

-- Drop any old stage check constraints and replace with MVP check
-- (safe and idempotent)
do $$
declare
  c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'transactions'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%stage%'
  loop
    execute format('alter table transactions drop constraint if exists %I', c.conname);
  end loop;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'transactions'::regclass
      and conname = 'transactions_stage_check'
  ) then
    alter table transactions
      add constraint transactions_stage_check
      check (
        stage in (
          'Available',
          'Reserved',
          'OTP Signed',
          'Deposit Paid',
          'Finance Pending',
          'Bond Approved / Proof of Funds',
          'Proceed to Attorneys',
          'Transfer in Progress',
          'Transfer Lodged',
          'Registered'
        )
      );
  end if;
end $$;

-- Backfill notes.body from legacy notes.content if present
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'notes'
      and column_name = 'content'
  ) then
    execute '
      update notes
      set body = coalesce(body, content)
      where coalesce(body, '''') = ''''
    ';
  end if;
end $$;

-- Map legacy notes.unit_id -> notes.transaction_id
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'notes'
      and column_name = 'unit_id'
  ) then
    execute '
      update notes n
      set transaction_id = (
        select t.id
        from transactions t
        where t.unit_id = n.unit_id
        order by t.updated_at desc nulls last, t.created_at desc nulls last
        limit 1
      )
      where n.transaction_id is null
        and n.unit_id is not null
    ';
  end if;
end $$;

-- Backfill documents.name from legacy documents.file_name if present
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'documents'
      and column_name = 'file_name'
  ) then
    execute '
      update documents
      set name = coalesce(name, file_name)
      where coalesce(name, '''') = ''''
    ';
  end if;
end $$;

update documents
set category = coalesce(category, 'General');

-- Map legacy documents.unit_id -> documents.transaction_id
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'documents'
      and column_name = 'unit_id'
  ) then
    execute '
      update documents d
      set transaction_id = (
        select t.id
        from transactions t
        where t.unit_id = d.unit_id
        order by t.updated_at desc nulls last, t.created_at desc nulls last
        limit 1
      )
      where d.transaction_id is null
        and d.unit_id is not null
    ';
  end if;
end $$;

-- Keep updated_at current on transaction edits
create or replace function set_updated_at_timestamp()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_transactions_updated_at on transactions;
create trigger trg_transactions_updated_at
before update on transactions
for each row
execute function set_updated_at_timestamp();

-- RLS (open for MVP demo)
alter table developments enable row level security;
alter table units enable row level security;
alter table buyers enable row level security;
alter table transactions enable row level security;
alter table notes enable row level security;
alter table documents enable row level security;
alter table document_requirements enable row level security;

drop policy if exists developments_demo_all on developments;
create policy developments_demo_all on developments
for all to anon, authenticated
using (true)
with check (true);

drop policy if exists units_demo_all on units;
create policy units_demo_all on units
for all to anon, authenticated
using (true)
with check (true);

drop policy if exists buyers_demo_all on buyers;
create policy buyers_demo_all on buyers
for all to anon, authenticated
using (true)
with check (true);

drop policy if exists transactions_demo_all on transactions;
create policy transactions_demo_all on transactions
for all to anon, authenticated
using (true)
with check (true);

drop policy if exists notes_demo_all on notes;
create policy notes_demo_all on notes
for all to anon, authenticated
using (true)
with check (true);

drop policy if exists documents_demo_all on documents;
create policy documents_demo_all on documents
for all to anon, authenticated
using (true)
with check (true);

drop policy if exists document_requirements_demo_all on document_requirements;
create policy document_requirements_demo_all on document_requirements
for all to anon, authenticated
using (true)
with check (true);

-- Helpful indexes
create index if not exists units_development_id_idx on units (development_id);
create index if not exists transactions_unit_id_updated_at_idx on transactions (unit_id, updated_at desc);
create index if not exists notes_transaction_id_created_at_idx on notes (transaction_id, created_at desc);
create index if not exists documents_transaction_id_created_at_idx on documents (transaction_id, created_at desc);
create unique index if not exists document_requirements_global_category_key_idx
  on document_requirements (category_key)
  where development_id is null;
create unique index if not exists document_requirements_scoped_category_key_idx
  on document_requirements (development_id, category_key)
  where development_id is not null;
