-- Phase 6: Persist and backfill canonical transaction sale routes.
-- This keeps developer-direct, developer-assigned, and external-agency sales
-- distinguishable after conversion, rollup recompute, and document routing.

alter table public.transactions
  add column if not exists sale_route text,
  add column if not exists sale_channel text,
  add column if not exists seller_party_type text,
  add column if not exists lead_owner text,
  add column if not exists ownership_model text,
  add column if not exists source_agency_org_id uuid;

update public.transactions
set seller_party_type = case
  when transaction_type in ('developer_sale', 'development_sale') or development_id is not null then 'developer'
  else 'private_seller'
end
where seller_party_type is null;

update public.transactions
set sale_route = case
  when transaction_type in ('private_property', 'private_sale', 'resale') and development_id is null then 'private_property_sale'
  when source_agency_org_id is not null
    or lead_owner = 'agency'
    or ownership_model = 'agency_introduced'
    or sale_channel = 'agency_introduced'
    then 'external_agency_sale'
  when ownership_model = 'developer_assigned'
    or sale_channel = 'developer_assigned'
    or nullif(trim(coalesce(assigned_agent, '')), '') is not null
    or nullif(trim(coalesce(assigned_agent_email, '')), '') is not null
    then 'developer_assigned_sale'
  when transaction_type in ('developer_sale', 'development_sale') or development_id is not null then 'internal_developer_sale'
  else 'private_property_sale'
end
where sale_route is null;

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
  else lead_owner
end
where lead_owner is null;

update public.transactions
set ownership_model = case sale_route
  when 'external_agency_sale' then 'agency_introduced'
  when 'developer_assigned_sale' then 'developer_assigned'
  when 'internal_developer_sale' then 'developer_direct'
  else ownership_model
end
where ownership_model is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
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
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
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
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
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
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'transactions_lead_owner_check'
      and conrelid = 'public.transactions'::regclass
  ) then
    alter table public.transactions
      add constraint transactions_lead_owner_check
      check (
        lead_owner is null or lead_owner in (
          'developer',
          'agency'
        )
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
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
      );
  end if;
end $$;

create index if not exists transactions_sale_route_idx
  on public.transactions (sale_route);

create index if not exists transactions_source_agency_org_id_idx
  on public.transactions (source_agency_org_id)
  where source_agency_org_id is not null;
