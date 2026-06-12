begin;

create extension if not exists "pgcrypto";

do $$
begin
  if not exists (select 1 from pg_type where typname = 'commercial_company_type') then
    create type public.commercial_company_type as enum (
      'tenant',
      'landlord',
      'investor',
      'developer',
      'property_fund',
      'brokerage',
      'corporate',
      'other'
    );
  end if;
end
$$;

create table if not exists public.commercial_companies (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  branch_id uuid references public.organisation_branches(id) on delete set null,
  team_id uuid references public.commercial_teams(id) on delete set null,
  broker_id uuid not null references auth.users(id) on delete restrict,
  company_name text not null,
  company_type public.commercial_company_type not null default 'other',
  industry text,
  website text,
  registration_number text,
  vat_number text,
  phone text,
  email text,
  address text,
  city text,
  province text,
  country text,
  notes text,
  status text not null default 'active',
  primary_contact_id uuid,
  legacy_source_type text,
  legacy_source_id uuid,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  constraint commercial_companies_name_not_blank check (length(trim(company_name)) > 0),
  constraint commercial_companies_status_check check (status in ('active', 'inactive', 'prospect', 'archived'))
);

create table if not exists public.commercial_contacts (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  branch_id uuid references public.organisation_branches(id) on delete set null,
  team_id uuid references public.commercial_teams(id) on delete set null,
  broker_id uuid not null references auth.users(id) on delete restrict,
  company_id uuid not null references public.commercial_companies(id) on delete cascade,
  first_name text,
  last_name text,
  job_title text,
  email text,
  phone text,
  mobile text,
  preferred_contact_method text,
  decision_maker boolean not null default false,
  is_primary boolean not null default false,
  notes text,
  status text not null default 'active',
  legacy_source_type text,
  legacy_source_id uuid,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  constraint commercial_contacts_status_check check (status in ('active', 'inactive', 'archived'))
);

alter table public.commercial_companies
  drop constraint if exists commercial_companies_primary_contact_id_fkey;

alter table public.commercial_companies
  add constraint commercial_companies_primary_contact_id_fkey
  foreign key (primary_contact_id)
  references public.commercial_contacts(id)
  on delete set null;

create unique index if not exists commercial_companies_legacy_source_idx
  on public.commercial_companies (legacy_source_type, legacy_source_id)
  where legacy_source_type is not null and legacy_source_id is not null;
create index if not exists commercial_companies_organisation_idx
  on public.commercial_companies (organisation_id);
create index if not exists commercial_companies_hierarchy_idx
  on public.commercial_companies (organisation_id, branch_id, team_id, broker_id);
create index if not exists commercial_companies_name_idx
  on public.commercial_companies (organisation_id, company_name);
create index if not exists commercial_companies_status_idx
  on public.commercial_companies (organisation_id, status);
create index if not exists commercial_companies_type_idx
  on public.commercial_companies (organisation_id, company_type);

create unique index if not exists commercial_contacts_legacy_source_idx
  on public.commercial_contacts (legacy_source_type, legacy_source_id)
  where legacy_source_type is not null and legacy_source_id is not null;
create index if not exists commercial_contacts_organisation_idx
  on public.commercial_contacts (organisation_id);
create index if not exists commercial_contacts_hierarchy_idx
  on public.commercial_contacts (organisation_id, branch_id, team_id, broker_id);
create index if not exists commercial_contacts_company_idx
  on public.commercial_contacts (company_id, status);
create index if not exists commercial_contacts_name_idx
  on public.commercial_contacts (organisation_id, last_name, first_name);
create index if not exists commercial_contacts_email_idx
  on public.commercial_contacts (organisation_id, email);

drop trigger if exists trg_bridge_touch_commercial_companies_updated_at on public.commercial_companies;
create trigger trg_bridge_touch_commercial_companies_updated_at
before update on public.commercial_companies
for each row execute function public.bridge_touch_commercial_updated_at();

drop trigger if exists trg_bridge_touch_commercial_contacts_updated_at on public.commercial_contacts;
create trigger trg_bridge_touch_commercial_contacts_updated_at
before update on public.commercial_contacts
for each row execute function public.bridge_touch_commercial_updated_at();

alter table if exists public.commercial_requirements
  add column if not exists company_id uuid,
  add column if not exists contact_id uuid;

alter table if exists public.commercial_deals
  add column if not exists company_id uuid,
  add column if not exists contact_id uuid;

alter table if exists public.commercial_viewings
  add column if not exists contact_id uuid;

alter table if exists public.commercial_transactions
  add column if not exists contact_id uuid;

do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select conname
    from pg_constraint
    where conrelid = 'public.commercial_viewings'::regclass
      and contype = 'f'
      and array_position(
        conkey,
        (
          select attnum
          from pg_attribute
          where attrelid = 'public.commercial_viewings'::regclass
            and attname = 'company_id'
            and not attisdropped
          limit 1
        )
      ) is not null
  loop
    execute format('alter table public.commercial_viewings drop constraint if exists %I', constraint_name);
  end loop;

  for constraint_name in
    select conname
    from pg_constraint
    where conrelid = 'public.commercial_transactions'::regclass
      and contype = 'f'
      and array_position(
        conkey,
        (
          select attnum
          from pg_attribute
          where attrelid = 'public.commercial_transactions'::regclass
            and attname = 'company_id'
            and not attisdropped
          limit 1
        )
      ) is not null
  loop
    execute format('alter table public.commercial_transactions drop constraint if exists %I', constraint_name);
  end loop;
end
$$;

insert into public.commercial_companies (
  organisation_id,
  branch_id,
  team_id,
  broker_id,
  company_name,
  company_type,
  industry,
  website,
  phone,
  email,
  notes,
  status,
  legacy_source_type,
  legacy_source_id,
  created_by,
  created_at,
  updated_at,
  updated_by
)
select
  tenant.organisation_id,
  tenant.branch_id,
  tenant.team_id,
  coalesce(
    tenant.broker_id,
    tenant.created_by,
    (
      select coalesce(req.broker_id, req.assigned_broker)
      from public.commercial_requirements req
      where req.tenant_id = tenant.id
        and coalesce(req.broker_id, req.assigned_broker) is not null
      order by coalesce(req.updated_at, req.created_at) desc, req.id desc
      limit 1
    ),
    (
      select coalesce(deal.broker_id, deal.assigned_broker)
      from public.commercial_deals deal
      where deal.tenant_id = tenant.id
        and coalesce(deal.broker_id, deal.assigned_broker) is not null
      order by coalesce(deal.updated_at, deal.created_at) desc, deal.id desc
      limit 1
    ),
    (
      select viewing.broker_id
      from public.commercial_viewings viewing
      where viewing.company_id = tenant.id
        and viewing.broker_id is not null
      order by coalesce(viewing.updated_at, viewing.created_at) desc, viewing.id desc
      limit 1
    ),
    (
      select tx.broker_id
      from public.commercial_transactions tx
      where tx.company_id = tenant.id
        and tx.broker_id is not null
      order by coalesce(tx.updated_at, tx.created_at) desc, tx.id desc
      limit 1
    ),
    (
      select ou.user_id
      from public.organisation_users ou
      where ou.organisation_id = tenant.organisation_id
        and ou.user_id is not null
      order by ou.id
      limit 1
    )
  ) as broker_id,
  tenant.name,
  case
    when lower(coalesce(tenant.industry, '')) like '%fund%' then 'property_fund'::public.commercial_company_type
    when lower(coalesce(tenant.industry, '')) like '%invest%' then 'investor'::public.commercial_company_type
    when lower(coalesce(tenant.industry, '')) like '%develop%' then 'developer'::public.commercial_company_type
    when lower(coalesce(tenant.industry, '')) like '%corporate%' then 'corporate'::public.commercial_company_type
    else 'tenant'::public.commercial_company_type
  end,
  tenant.industry,
  null,
  tenant.phone,
  tenant.email,
  tenant.notes,
  case when tenant.status in ('inactive', 'archived') then tenant.status else 'active' end,
  'tenant',
  tenant.id,
  tenant.created_by,
  coalesce(tenant.created_at, now()),
  coalesce(tenant.updated_at, tenant.created_at, now()),
  tenant.updated_by
from public.commercial_tenants tenant
where not exists (
  select 1
  from public.commercial_companies company
  where company.legacy_source_type = 'tenant'
    and company.legacy_source_id = tenant.id
);

insert into public.commercial_companies (
  organisation_id,
  branch_id,
  team_id,
  broker_id,
  company_name,
  company_type,
  website,
  phone,
  email,
  notes,
  status,
  legacy_source_type,
  legacy_source_id,
  created_by,
  created_at,
  updated_at,
  updated_by
)
select
  landlord.organisation_id,
  landlord.branch_id,
  landlord.team_id,
  coalesce(
    landlord.broker_id,
    landlord.created_by,
    (
      select property.broker_id
      from public.commercial_properties property
      where property.landlord_id = landlord.id
        and property.broker_id is not null
      order by coalesce(property.updated_at, property.created_at) desc, property.id desc
      limit 1
    ),
    (
      select deal.broker_id
      from public.commercial_deals deal
      where deal.landlord_id = landlord.id
        and deal.broker_id is not null
      order by coalesce(deal.updated_at, deal.created_at) desc, deal.id desc
      limit 1
    ),
    (
      select ou.user_id
      from public.organisation_users ou
      where ou.organisation_id = landlord.organisation_id
        and ou.user_id is not null
      order by ou.id
      limit 1
    )
  ) as broker_id,
  landlord.name,
  case
    when landlord.landlord_type in ('listed_fund', 'institution') then 'property_fund'::public.commercial_company_type
    when landlord.landlord_type = 'developer' then 'developer'::public.commercial_company_type
    else 'landlord'::public.commercial_company_type
  end,
  landlord.website,
  landlord.phone,
  landlord.email,
  concat_ws(E'\n', nullif(trim(landlord.portfolio_notes), ''), nullif(trim(landlord.notes), '')),
  case when landlord.status in ('inactive', 'archived') then landlord.status else 'active' end,
  'landlord',
  landlord.id,
  landlord.created_by,
  coalesce(landlord.created_at, now()),
  coalesce(landlord.updated_at, landlord.created_at, now()),
  landlord.updated_by
from public.commercial_landlords landlord
where not exists (
  select 1
  from public.commercial_companies company
  where company.legacy_source_type = 'landlord'
    and company.legacy_source_id = landlord.id
);

insert into public.commercial_contacts (
  organisation_id,
  branch_id,
  team_id,
  broker_id,
  company_id,
  first_name,
  last_name,
  email,
  phone,
  preferred_contact_method,
  decision_maker,
  is_primary,
  notes,
  status,
  legacy_source_type,
  legacy_source_id,
  created_by,
  created_at,
  updated_at,
  updated_by
)
select
  company.organisation_id,
  company.branch_id,
  company.team_id,
  company.broker_id,
  company.id,
  nullif(split_part(source.contact_person, ' ', 1), ''),
  nullif(trim(substr(source.contact_person, length(split_part(source.contact_person, ' ', 1)) + 1)), ''),
  nullif(trim(source.email), ''),
  nullif(trim(source.phone), ''),
  source.preferred_contact_method,
  true,
  true,
  null,
  case when source.status = 'inactive' then 'inactive' else 'active' end,
  source.legacy_source_type,
  source.legacy_source_id,
  source.created_by,
  source.created_at,
  source.updated_at,
  source.updated_by
from (
  select
    'tenant'::text as legacy_source_type,
    tenant.id as legacy_source_id,
    tenant.organisation_id,
    tenant.contact_person,
    tenant.email,
    tenant.phone,
    tenant.preferred_contact_method,
    tenant.status,
    tenant.created_by,
    coalesce(tenant.created_at, now()) as created_at,
    coalesce(tenant.updated_at, tenant.created_at, now()) as updated_at,
    tenant.updated_by
  from public.commercial_tenants tenant
  union all
  select
    'landlord'::text as legacy_source_type,
    landlord.id as legacy_source_id,
    landlord.organisation_id,
    landlord.contact_person,
    landlord.email,
    landlord.phone,
    landlord.preferred_contact_method,
    landlord.status,
    landlord.created_by,
    coalesce(landlord.created_at, now()) as created_at,
    coalesce(landlord.updated_at, landlord.created_at, now()) as updated_at,
    landlord.updated_by
  from public.commercial_landlords landlord
) source
join public.commercial_companies company
  on company.legacy_source_type = source.legacy_source_type
 and company.legacy_source_id = source.legacy_source_id
where nullif(trim(source.contact_person), '') is not null
  and not exists (
    select 1
    from public.commercial_contacts contact
    where contact.legacy_source_type = source.legacy_source_type
      and contact.legacy_source_id = source.legacy_source_id
  );

update public.commercial_companies company
set primary_contact_id = contact.id
from (
  select distinct on (company_id)
    id,
    company_id
  from public.commercial_contacts
  order by company_id, is_primary desc, created_at asc, id asc
) contact
where company.id = contact.company_id
  and company.primary_contact_id is distinct from contact.id;

update public.commercial_requirements req
set
  company_id = company.id,
  contact_id = coalesce(req.contact_id, company.primary_contact_id)
from public.commercial_companies company
where req.company_id is null
  and company.legacy_source_type = 'tenant'
  and company.legacy_source_id = req.tenant_id;

update public.commercial_deals deal
set
  company_id = company.id,
  contact_id = coalesce(deal.contact_id, company.primary_contact_id)
from public.commercial_companies company
where deal.company_id is null
  and company.legacy_source_type = 'tenant'
  and company.legacy_source_id = deal.tenant_id;

update public.commercial_viewings viewing
set
  company_id = company.id,
  contact_id = coalesce(viewing.contact_id, company.primary_contact_id)
from public.commercial_companies company
where company.legacy_source_type = 'tenant'
  and company.legacy_source_id = viewing.company_id;

update public.commercial_transactions tx
set
  company_id = company.id,
  contact_id = coalesce(tx.contact_id, company.primary_contact_id)
from public.commercial_companies company
where company.legacy_source_type = 'tenant'
  and company.legacy_source_id = tx.company_id;

alter table public.commercial_requirements
  drop constraint if exists commercial_requirements_company_id_fkey,
  drop constraint if exists commercial_requirements_contact_id_fkey,
  add constraint commercial_requirements_company_id_fkey
    foreign key (company_id)
    references public.commercial_companies(id)
    on delete set null,
  add constraint commercial_requirements_contact_id_fkey
    foreign key (contact_id)
    references public.commercial_contacts(id)
    on delete set null;

alter table public.commercial_deals
  drop constraint if exists commercial_deals_company_id_fkey,
  drop constraint if exists commercial_deals_contact_id_fkey,
  add constraint commercial_deals_company_id_fkey
    foreign key (company_id)
    references public.commercial_companies(id)
    on delete set null,
  add constraint commercial_deals_contact_id_fkey
    foreign key (contact_id)
    references public.commercial_contacts(id)
    on delete set null;

alter table public.commercial_viewings
  drop constraint if exists commercial_viewings_company_id_fkey,
  drop constraint if exists commercial_viewings_contact_id_fkey,
  add constraint commercial_viewings_company_id_fkey
    foreign key (company_id)
    references public.commercial_companies(id)
    on delete set null,
  add constraint commercial_viewings_contact_id_fkey
    foreign key (contact_id)
    references public.commercial_contacts(id)
    on delete set null;

alter table public.commercial_transactions
  drop constraint if exists commercial_transactions_company_id_fkey,
  drop constraint if exists commercial_transactions_contact_id_fkey,
  add constraint commercial_transactions_company_id_fkey
    foreign key (company_id)
    references public.commercial_companies(id)
    on delete set null,
  add constraint commercial_transactions_contact_id_fkey
    foreign key (contact_id)
    references public.commercial_contacts(id)
    on delete set null;

create index if not exists commercial_requirements_company_idx
  on public.commercial_requirements (organisation_id, company_id, contact_id);
create index if not exists commercial_deals_company_idx
  on public.commercial_deals (organisation_id, company_id, contact_id);
create index if not exists commercial_viewings_company_idx
  on public.commercial_viewings (organisation_id, company_id, contact_id);
create index if not exists commercial_transactions_company_idx
  on public.commercial_transactions (organisation_id, company_id, contact_id);

alter table public.commercial_companies enable row level security;
alter table public.commercial_contacts enable row level security;

drop policy if exists commercial_companies_brokerage_access on public.commercial_companies;
create policy commercial_companies_brokerage_access on public.commercial_companies
for all to authenticated
using (public.bridge_commercial_can_access_record(organisation_id, branch_id, team_id, broker_id, created_by))
with check (public.bridge_commercial_can_access_record(organisation_id, branch_id, team_id, broker_id, created_by));

drop policy if exists commercial_contacts_brokerage_access on public.commercial_contacts;
create policy commercial_contacts_brokerage_access on public.commercial_contacts
for all to authenticated
using (public.bridge_commercial_can_access_record(organisation_id, branch_id, team_id, broker_id, created_by))
with check (public.bridge_commercial_can_access_record(organisation_id, branch_id, team_id, broker_id, created_by));

grant select, insert, update, delete on public.commercial_companies to authenticated;
grant select, insert, update, delete on public.commercial_contacts to authenticated;

commit;
