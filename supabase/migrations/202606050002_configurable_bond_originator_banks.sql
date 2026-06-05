create table if not exists public.banks (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  short_name text not null,
  logo_url text,
  country text not null default 'ZA',
  bank_type text not null default 'retail',
  is_active boolean not null default true,
  display_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint banks_unique_short_name_country unique (country, short_name),
  constraint banks_unique_name_country unique (country, name)
);

create table if not exists public.bond_originator_banks (
  id uuid primary key default gen_random_uuid(),
  originator_org_id uuid not null references public.organisations(id) on delete cascade,
  bank_id uuid not null references public.banks(id) on delete restrict,
  status text not null default 'active',
  primary_contact_name text,
  primary_contact_email text,
  primary_contact_phone text,
  submission_email text,
  portal_url text,
  sla_days integer,
  supported_products text[] not null default '{}'::text[],
  regions_supported text[] not null default '{}'::text[],
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bond_originator_banks_status_check check (status in ('active', 'inactive', 'pending', 'suspended')),
  constraint bond_originator_banks_unique_bank unique (originator_org_id, bank_id)
);

alter table if exists public.transaction_bond_applications
  add column if not exists bank_id uuid references public.banks(id) on delete set null;

alter table if exists public.transaction_bond_quotes
  add column if not exists bank_id uuid references public.banks(id) on delete set null;

create index if not exists banks_active_display_idx
  on public.banks (country, is_active, display_order, short_name);

create index if not exists bond_originator_banks_org_status_idx
  on public.bond_originator_banks (originator_org_id, status, bank_id);

create index if not exists transaction_bond_applications_bank_idx
  on public.transaction_bond_applications (bank_id, bank_name);

create index if not exists transaction_bond_quotes_bank_idx
  on public.transaction_bond_quotes (bank_id, bank_name);

insert into public.banks (name, short_name, country, bank_type, is_active, display_order)
values
  ('ABSA', 'ABSA', 'ZA', 'retail', true, 10),
  ('First National Bank', 'FNB', 'ZA', 'retail', true, 20),
  ('Nedbank', 'Nedbank', 'ZA', 'retail', true, 30),
  ('Standard Bank', 'Standard Bank', 'ZA', 'retail', true, 40),
  ('Investec', 'Investec', 'ZA', 'private', true, 50),
  ('Capitec', 'Capitec', 'ZA', 'retail', true, 60),
  ('SA Home Loans', 'SA Home Loans', 'ZA', 'mortgage_originator', true, 70),
  ('African Bank', 'African Bank', 'ZA', 'retail', true, 80),
  ('Other', 'Other', 'ZA', 'other', true, 999)
on conflict (country, short_name) do update
set
  name = excluded.name,
  bank_type = excluded.bank_type,
  is_active = excluded.is_active,
  display_order = excluded.display_order,
  updated_at = now();

update public.transaction_bond_applications tba
set bank_id = matched.id
from public.banks matched
where tba.bank_id is null
  and (
    lower(coalesce(tba.bank_name, '')) = lower(matched.short_name)
    or lower(coalesce(tba.bank_name, '')) = lower(matched.name)
    or (lower(coalesce(tba.bank_name, '')) in ('first national bank', 'f.n.b', 'fnb') and matched.short_name = 'FNB')
  );

update public.transaction_bond_quotes tbq
set bank_id = matched.id
from public.banks matched
where tbq.bank_id is null
  and (
    lower(coalesce(tbq.bank_name, '')) = lower(matched.short_name)
    or lower(coalesce(tbq.bank_name, '')) = lower(matched.name)
    or (lower(coalesce(tbq.bank_name, '')) in ('first national bank', 'f.n.b', 'fnb') and matched.short_name = 'FNB')
  );

update public.transaction_bond_applications tba
set bank_id = other_bank.id
from public.banks other_bank
where tba.bank_id is null
  and coalesce(tba.bank_name, '') <> ''
  and other_bank.short_name = 'Other'
  and other_bank.country = 'ZA';

update public.transaction_bond_quotes tbq
set bank_id = other_bank.id
from public.banks other_bank
where tbq.bank_id is null
  and coalesce(tbq.bank_name, '') <> ''
  and other_bank.short_name = 'Other'
  and other_bank.country = 'ZA';

insert into public.bond_originator_banks (
  originator_org_id,
  bank_id,
  status,
  sla_days,
  supported_products,
  regions_supported
)
select
  org.id,
  bank.id,
  'active',
  5,
  array['Residential Bond']::text[],
  '{}'::text[]
from public.organisations org
cross join public.banks bank
where bank.short_name in ('ABSA', 'FNB', 'Nedbank', 'Standard Bank', 'Investec', 'Other')
  and exists (
    select 1
    from public.organisation_users ou
    where ou.organisation_id = org.id
      and (
        ou.workspace_type = 'bond_originator'
        or ou.role = 'bond_originator'
        or ou.workspace_role in ('owner_director', 'hq_manager', 'regional_manager', 'branch_manager', 'consultant')
      )
  )
on conflict (originator_org_id, bank_id) do nothing;

alter table public.banks enable row level security;
alter table public.bond_originator_banks enable row level security;

drop policy if exists banks_active_select on public.banks;
create policy banks_active_select
on public.banks
for select
to authenticated
using (
  is_active = true
  or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'platform_admin')
);

drop policy if exists banks_platform_admin_modify on public.banks;
create policy banks_platform_admin_modify
on public.banks
for all
to authenticated
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'platform_admin'))
with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'platform_admin'));

drop policy if exists bond_originator_banks_member_select on public.bond_originator_banks;
create policy bond_originator_banks_member_select
on public.bond_originator_banks
for select
to authenticated
using (
  public.bridge_is_active_member(originator_org_id)
  and (
    status = 'active'
    or public.bridge_current_bond_scope_level(originator_org_id) = 'workspace_hq'
  )
);

drop policy if exists bond_originator_banks_hq_modify on public.bond_originator_banks;
create policy bond_originator_banks_hq_modify
on public.bond_originator_banks
for all
to authenticated
using (
  public.bridge_is_active_member(originator_org_id)
  and public.bridge_current_bond_scope_level(originator_org_id) = 'workspace_hq'
)
with check (
  public.bridge_is_active_member(originator_org_id)
  and public.bridge_current_bond_scope_level(originator_org_id) = 'workspace_hq'
);
