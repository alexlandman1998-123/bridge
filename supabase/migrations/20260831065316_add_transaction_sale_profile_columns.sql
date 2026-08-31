-- Complete and backfill the canonical transaction sale profile used by the developer-sale
-- wizard, attorney routing, client portal profile, and document workspaces.
--
-- The columns remain nullable for legacy/imported transaction compatibility,
-- but every non-null value is constrained to the application contract.

set lock_timeout = '10s';

alter table public.transactions
  add column if not exists sale_route text,
  add column if not exists sale_channel text,
  add column if not exists seller_party_type text,
  add column if not exists lead_owner text,
  add column if not exists ownership_model text,
  add column if not exists source_agency_org_id uuid;

comment on column public.transactions.sale_route is
  'Canonical sale route: internal developer, developer assigned, external agency, or private property.';
comment on column public.transactions.sale_channel is
  'Developer-sale channel captured when the transaction is created.';
comment on column public.transactions.seller_party_type is
  'Canonical seller-side party represented by the transaction.';
comment on column public.transactions.lead_owner is
  'Owner of the originating developer lead, when applicable.';
comment on column public.transactions.ownership_model is
  'Commercial ownership model for the originating developer lead.';
comment on column public.transactions.source_agency_org_id is
  'Introducing agency organisation for an external-agency developer sale.';

-- Recover explicit developer-lead attribution first. Choosing the latest linked
-- lead makes this deterministic if historical conversion data contains more
-- than one lead for the same transaction.
with latest_developer_lead as (
  select distinct on (lead.converted_transaction_id)
    lead.converted_transaction_id as transaction_id,
    lead.source_agency_org_id,
    lead.lead_owner,
    lead.ownership_model
  from public.developer_leads lead
  where lead.converted_transaction_id is not null
  order by
    lead.converted_transaction_id,
    lead.updated_at desc nulls last,
    lead.developer_lead_id desc
)
update public.transactions tx
set
  source_agency_org_id = coalesce(tx.source_agency_org_id, lead.source_agency_org_id),
  lead_owner = coalesce(tx.lead_owner, lead.lead_owner),
  ownership_model = coalesce(tx.ownership_model, lead.ownership_model)
from latest_developer_lead lead
where lead.transaction_id = tx.id
  and (
    tx.source_agency_org_id is null
    or tx.lead_owner is null
    or tx.ownership_model is null
  );

update public.transactions
set sale_route = case
  when lower(trim(coalesce(transaction_type, ''))) in (
    'private_property',
    'private_sale',
    'resale'
  ) and development_id is null then 'private_property_sale'
  when source_agency_org_id is not null
    or lead_owner = 'agency'
    or ownership_model = 'agency_introduced'
    or sale_channel = 'agency_introduced'
    then 'external_agency_sale'
  when (
    lower(trim(coalesce(transaction_type, ''))) in (
      'development',
      'developer_sale',
      'development_sale',
      'bond_application'
    )
    or development_id is not null
  ) and (
    ownership_model = 'developer_assigned'
    or sale_channel = 'developer_assigned'
    or assigned_agent_id is not null
    or nullif(trim(coalesce(assigned_agent, '')), '') is not null
    or nullif(trim(coalesce(assigned_agent_email, '')), '') is not null
  ) then 'developer_assigned_sale'
  when lower(trim(coalesce(transaction_type, ''))) in (
    'development',
    'developer_sale',
    'development_sale',
    'bond_application'
  ) or development_id is not null then 'internal_developer_sale'
  else 'private_property_sale'
end
where sale_route is null;

update public.transactions
set seller_party_type = case
  when sale_route = 'private_property_sale' then 'private_seller'
  else 'developer'
end
where seller_party_type is distinct from case
  when sale_route = 'private_property_sale' then 'private_seller'
  else 'developer'
end;

update public.transactions
set sale_channel = case sale_route
  when 'external_agency_sale' then 'agency_introduced'
  when 'developer_assigned_sale' then 'developer_assigned'
  when 'internal_developer_sale' then 'developer_direct'
  else null
end
where sale_channel is null;

update public.transactions
set lead_owner = case
  when sale_route = 'external_agency_sale' then 'agency'
  when sale_route in ('internal_developer_sale', 'developer_assigned_sale') then 'developer'
  else null
end
where lead_owner is null;

update public.transactions
set ownership_model = case sale_route
  when 'external_agency_sale' then 'agency_introduced'
  when 'developer_assigned_sale' then 'developer_assigned'
  when 'internal_developer_sale' then 'developer_direct'
  else null
end
where ownership_model is null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'transactions_sale_route_check'
      and conrelid = 'public.transactions'::regclass
  ) then
    alter table public.transactions
      add constraint transactions_sale_route_check
      check (
        sale_route is null or sale_route in (
          'internal_developer_sale',
          'developer_assigned_sale',
          'external_agency_sale',
          'private_property_sale'
        )
      ) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'transactions_sale_channel_check'
      and conrelid = 'public.transactions'::regclass
  ) then
    alter table public.transactions
      add constraint transactions_sale_channel_check
      check (
        sale_channel is null or sale_channel in (
          'developer_direct',
          'developer_assigned',
          'agency_introduced'
        )
      ) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'transactions_seller_party_type_check'
      and conrelid = 'public.transactions'::regclass
  ) then
    alter table public.transactions
      add constraint transactions_seller_party_type_check
      check (
        seller_party_type is null or seller_party_type in (
          'developer',
          'private_seller'
        )
      ) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'transactions_lead_owner_check'
      and conrelid = 'public.transactions'::regclass
  ) then
    alter table public.transactions
      add constraint transactions_lead_owner_check
      check (lead_owner is null or lead_owner in ('developer', 'agency'))
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'transactions_ownership_model_check'
      and conrelid = 'public.transactions'::regclass
  ) then
    alter table public.transactions
      add constraint transactions_ownership_model_check
      check (
        ownership_model is null or ownership_model in (
          'developer_direct',
          'developer_assigned',
          'agency_introduced'
        )
      ) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'transactions_source_agency_org_id_fkey'
      and conrelid = 'public.transactions'::regclass
  ) then
    alter table public.transactions
      add constraint transactions_source_agency_org_id_fkey
      foreign key (source_agency_org_id)
      references public.organisations(id)
      on delete set null
      not valid;
  end if;
end $$;

alter table public.transactions validate constraint transactions_sale_route_check;
alter table public.transactions validate constraint transactions_sale_channel_check;
alter table public.transactions validate constraint transactions_seller_party_type_check;
alter table public.transactions validate constraint transactions_lead_owner_check;
alter table public.transactions validate constraint transactions_ownership_model_check;
alter table public.transactions validate constraint transactions_source_agency_org_id_fkey;

create index if not exists transactions_sale_route_idx
  on public.transactions (sale_route);

create index if not exists transactions_sale_channel_idx
  on public.transactions (sale_channel)
  where sale_channel is not null;

create index if not exists transactions_seller_party_type_idx
  on public.transactions (seller_party_type)
  where seller_party_type is not null;

create index if not exists transactions_source_agency_org_id_idx
  on public.transactions (source_agency_org_id)
  where source_agency_org_id is not null;
