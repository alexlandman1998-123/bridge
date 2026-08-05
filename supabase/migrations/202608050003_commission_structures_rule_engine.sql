-- Phase 3 commission structures.
--
-- This phase makes commission structures operational: legacy settings records
-- are mirrored into the canonical model, structures can be validated and
-- activated, and transaction commission snapshots can apply structure rules to
-- the canonical allocation ledger.

begin;

create table if not exists public.organisation_commission_structures (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  name text not null,
  listing_commission_type text not null default 'percentage',
  listing_commission_percentage numeric(7,4),
  listing_commission_amount numeric(14,2),
  agent_split_percentage numeric(7,4) not null default 60,
  agency_split_percentage numeric(7,4) not null default 40,
  allow_sales_commission_override boolean not null default true,
  is_default boolean not null default false,
  is_active boolean not null default true,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organisation_commission_structures_listing_type_check
    check (listing_commission_type in ('percentage', 'fixed')),
  constraint organisation_commission_structures_listing_value_check
    check (
      (listing_commission_type = 'percentage' and listing_commission_percentage is not null and listing_commission_percentage between 0 and 100)
      or (listing_commission_type = 'fixed' and listing_commission_amount is not null and listing_commission_amount >= 0)
    ),
  constraint organisation_commission_structures_split_check
    check (
      agent_split_percentage between 0 and 100
      and agency_split_percentage between 0 and 100
      and round((agent_split_percentage + agency_split_percentage)::numeric, 4) = 100.0000
    )
);

alter table if exists public.organisation_commission_structures
  add column if not exists listing_commission_type text not null default 'percentage',
  add column if not exists listing_commission_percentage numeric(7,4),
  add column if not exists listing_commission_amount numeric(14,2),
  add column if not exists agent_split_percentage numeric(7,4) not null default 60,
  add column if not exists agency_split_percentage numeric(7,4) not null default 40,
  add column if not exists allow_sales_commission_override boolean not null default true,
  add column if not exists is_default boolean not null default false,
  add column if not exists is_active boolean not null default true,
  add column if not exists notes text,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create index if not exists organisation_commission_structures_org_name_idx
  on public.organisation_commission_structures (organisation_id, lower(name));

do $$
begin
  if not exists (
    select 1
    from public.organisation_commission_structures
    where is_default = true and is_active = true
    group by organisation_id
    having count(*) > 1
  ) then
    execute 'create unique index if not exists organisation_commission_structures_default_idx
      on public.organisation_commission_structures (organisation_id)
      where is_default = true and is_active = true';
  end if;
end;
$$;

create index if not exists organisation_commission_structures_org_active_idx
  on public.organisation_commission_structures (organisation_id, is_active, is_default, name);

drop trigger if exists trg_organisation_commission_structures_updated_at on public.organisation_commission_structures;
create trigger trg_organisation_commission_structures_updated_at
before update on public.organisation_commission_structures
for each row
execute function public.set_updated_at_timestamp();

create table if not exists public.organisation_user_commission_profiles (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  organisation_user_id uuid references public.organisation_users(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  email_address text,
  commission_structure_id uuid references public.organisation_commission_structures(id) on delete set null,
  commission_level_id uuid references public.commission_levels(id) on delete set null,
  override_agent_split_percentage numeric(7,4),
  effective_from date not null default current_date,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organisation_user_commission_profiles_target_check
    check (organisation_user_id is not null or user_id is not null or nullif(email_address, '') is not null),
  constraint organisation_user_commission_profiles_override_check
    check (override_agent_split_percentage is null or override_agent_split_percentage between 0 and 100)
);

alter table if exists public.organisation_user_commission_profiles
  add column if not exists commission_structure_id uuid references public.organisation_commission_structures(id) on delete set null,
  add column if not exists commission_level_id uuid references public.commission_levels(id) on delete set null,
  add column if not exists override_agent_split_percentage numeric(7,4),
  add column if not exists effective_from date not null default current_date,
  add column if not exists is_active boolean not null default true,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create index if not exists organisation_user_commission_profiles_org_active_idx
  on public.organisation_user_commission_profiles (organisation_id, is_active, effective_from desc);

create index if not exists organisation_user_commission_profiles_structure_idx
  on public.organisation_user_commission_profiles (organisation_id, commission_structure_id)
  where commission_structure_id is not null and is_active = true;

create index if not exists organisation_user_commission_profiles_active_org_user_idx
  on public.organisation_user_commission_profiles (organisation_id, organisation_user_id)
  where organisation_user_id is not null and is_active = true;

create index if not exists organisation_user_commission_profiles_active_user_idx
  on public.organisation_user_commission_profiles (organisation_id, user_id)
  where user_id is not null and is_active = true;

create index if not exists organisation_user_commission_profiles_active_email_idx
  on public.organisation_user_commission_profiles (organisation_id, lower(email_address))
  where email_address is not null and is_active = true;

drop trigger if exists trg_organisation_user_commission_profiles_updated_at on public.organisation_user_commission_profiles;
create trigger trg_organisation_user_commission_profiles_updated_at
before update on public.organisation_user_commission_profiles
for each row
execute function public.set_updated_at_timestamp();

alter table if exists public.transaction_commissions
  add column if not exists commission_structure_id uuid,
  add column if not exists commission_structure_version integer,
  add column if not exists commission_structure_name_snapshot text,
  add column if not exists sale_price numeric(14,2),
  add column if not exists gross_commission_percentage numeric(7,4),
  add column if not exists agent_split_percentage_snapshot numeric(7,4),
  add column if not exists agency_split_percentage_snapshot numeric(7,4);

do $$
begin
  if not exists (
    select 1
    from public.transaction_commissions
    where transaction_id is not null
    group by transaction_id
    having count(*) > 1
  ) then
    execute 'create unique index if not exists transaction_commissions_transaction_unique_idx
      on public.transaction_commissions (transaction_id)
      where transaction_id is not null';
  end if;
end;
$$;

create unique index if not exists transaction_commission_allocations_structure_rule_unique_idx
  on public.transaction_commission_allocations (
    transaction_id,
    commission_structure_rule_id,
    allocation_type,
    participant_role
  )
  where commission_structure_rule_id is not null
    and source_referral_id is null
    and status <> 'cancelled';

create index if not exists transaction_commission_allocations_structure_reporting_idx
  on public.transaction_commission_allocations (organisation_id, commission_structure_id, allocation_type, status);

create or replace view public.commission_structure_validation_v1 as
select
  structure.id as commission_structure_id,
  structure.organisation_id,
  structure.name,
  structure.version,
  structure.status,
  pool.calculation_basis,
  pool.allocation_pool,
  pool.rule_count,
  pool.percentage_total,
  pool.fixed_amount_total,
  (pool.percentage_total <= 100) as percentage_pool_valid
from public.commission_structures structure
left join public.commission_structure_rule_pool_totals pool
  on pool.commission_structure_id = structure.id;

create or replace function public.bridge_validate_commission_structure(p_commission_structure_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  structure_row public.commission_structures%rowtype;
  invalid_pools jsonb;
  rule_count integer;
begin
  select *
    into structure_row
  from public.commission_structures
  where id = p_commission_structure_id
  limit 1;

  if structure_row.id is null then
    return jsonb_build_object('success', false, 'code', 'structure_not_found');
  end if;

  if not (
    public.bridge_is_org_admin(structure_row.organisation_id)
    or public.bridge_is_active_member(structure_row.organisation_id)
    or coalesce(auth.role(), '') = 'service_role'
  ) then
    return jsonb_build_object('success', false, 'code', 'forbidden');
  end if;

  select count(*)::integer
    into rule_count
  from public.commission_structure_rules
  where commission_structure_id = structure_row.id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'calculation_basis', calculation_basis,
    'allocation_pool', allocation_pool,
    'percentage_total', percentage_total
  )), '[]'::jsonb)
    into invalid_pools
  from public.commission_structure_rule_pool_totals
  where commission_structure_id = structure_row.id
    and percentage_total > 100;

  return jsonb_build_object(
    'success', jsonb_array_length(invalid_pools) = 0 and rule_count > 0,
    'code', case
      when rule_count = 0 then 'no_rules'
      when jsonb_array_length(invalid_pools) > 0 then 'pool_percentage_exceeded'
      else 'valid'
    end,
    'commission_structure_id', structure_row.id,
    'rule_count', rule_count,
    'invalid_pools', invalid_pools
  );
end;
$$;

create or replace function public.bridge_activate_commission_structure(
  p_commission_structure_id uuid,
  p_make_default boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  structure_row public.commission_structures%rowtype;
  validation jsonb;
begin
  select *
    into structure_row
  from public.commission_structures
  where id = p_commission_structure_id
  limit 1;

  if structure_row.id is null then
    return jsonb_build_object('success', false, 'code', 'structure_not_found');
  end if;

  if not public.bridge_is_org_admin(structure_row.organisation_id) and coalesce(auth.role(), '') <> 'service_role' then
    return jsonb_build_object('success', false, 'code', 'forbidden');
  end if;

  validation := public.bridge_validate_commission_structure(structure_row.id);
  if coalesce((validation->>'success')::boolean, false) is not true then
    return validation || jsonb_build_object('activated', false);
  end if;

  if p_make_default then
    update public.commission_structures
      set is_default = false,
          updated_at = now()
    where organisation_id = structure_row.organisation_id
      and id <> structure_row.id
      and transaction_type = structure_row.transaction_type
      and coalesce(property_type, '') = coalesce(structure_row.property_type, '')
      and coalesce(mandate_type, '') = coalesce(structure_row.mandate_type, '')
      and is_default = true
      and status = 'active';
  end if;

  update public.commission_structures
    set status = 'active',
        is_default = case when p_make_default then true else is_default end,
        activated_by = auth.uid(),
        activated_at = coalesce(activated_at, now()),
        archived_at = null,
        updated_at = now()
  where id = structure_row.id
  returning * into structure_row;

  return jsonb_build_object(
    'success', true,
    'code', 'activated',
    'commission_structure_id', structure_row.id,
    'is_default', structure_row.is_default
  );
end;
$$;

create or replace function public.bridge_enforce_commission_structure_activation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  validation jsonb;
begin
  if new.status = 'active' and old.status is distinct from 'active' then
    validation := public.bridge_validate_commission_structure(new.id);
    if coalesce((validation->>'success')::boolean, false) is not true then
      raise exception 'Commission structure cannot be activated: %', validation->>'code'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_commission_structures_activation_guard on public.commission_structures;
create trigger trg_commission_structures_activation_guard
before update of status on public.commission_structures
for each row
execute function public.bridge_enforce_commission_structure_activation();

create or replace function public.bridge_sync_legacy_commission_structure(p_legacy_structure_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  legacy_row public.organisation_commission_structures%rowtype;
  v_structure_id uuid;
  v_status text;
  v_listing_type text;
  v_listing_percentage numeric(7,4);
  v_listing_amount numeric(14,2);
begin
  select *
    into legacy_row
  from public.organisation_commission_structures
  where id = p_legacy_structure_id
  limit 1;

  if legacy_row.id is null then
    return null;
  end if;

  if pg_trigger_depth() = 0
     and coalesce(auth.role(), '') <> 'service_role'
     and not (
       public.bridge_is_org_admin(legacy_row.organisation_id)
       or public.bridge_is_active_member(legacy_row.organisation_id)
     ) then
    raise exception 'Organisation membership is required to sync commission structures.'
      using errcode = '42501';
  end if;

  v_status := case when legacy_row.is_active then 'active' else 'archived' end;
  v_listing_type := coalesce(nullif(legacy_row.listing_commission_type, ''), 'percentage');
  v_listing_percentage := case when v_listing_type = 'percentage' then legacy_row.listing_commission_percentage else null end;
  v_listing_amount := case when v_listing_type = 'fixed' then legacy_row.listing_commission_amount else null end;

  if legacy_row.is_default and legacy_row.is_active then
    update public.commission_structures
      set is_default = false,
          updated_at = now()
    where organisation_id = legacy_row.organisation_id
      and id <> legacy_row.id
      and transaction_type = 'default'
      and coalesce(property_type, '') = ''
      and coalesce(mandate_type, '') = ''
      and is_default = true
      and status = 'active';
  end if;

  insert into public.commission_structures (
    id,
    organisation_id,
    name,
    transaction_type,
    version,
    status,
    is_default,
    effective_from,
    created_by,
    activated_by,
    activated_at,
    archived_at,
    metadata
  )
  values (
    legacy_row.id,
    legacy_row.organisation_id,
    legacy_row.name,
    'default',
    1,
    case when v_status = 'active' then 'draft' else v_status end,
    legacy_row.is_default,
    current_date,
    legacy_row.created_by,
    null,
    null,
    case when v_status = 'archived' then now() else null end,
    jsonb_strip_nulls(jsonb_build_object(
      'source', 'phase_3_legacy_structure_sync',
      'legacy_structure_id', legacy_row.id,
      'listing_commission_type', v_listing_type,
      'listing_commission_percentage', v_listing_percentage,
      'listing_commission_amount', v_listing_amount,
      'allow_sales_commission_override', legacy_row.allow_sales_commission_override,
      'notes', legacy_row.notes
    ))
  )
  on conflict (id) do update
    set organisation_id = excluded.organisation_id,
        name = excluded.name,
        status = excluded.status,
        is_default = excluded.is_default,
        archived_at = excluded.archived_at,
        metadata = coalesce(public.commission_structures.metadata, '{}'::jsonb) || excluded.metadata,
        updated_at = now()
  returning id into v_structure_id;

  insert into public.commission_structure_rules (
    commission_structure_id,
    allocation_type,
    participant_role,
    scope,
    calculation_basis,
    allocation_pool,
    percentage,
    priority,
    requires_approval,
    metadata
  )
  values
    (
      v_structure_id,
      'selling_commission',
      'selling_agent',
      'internal',
      'gross_commission',
      'gross_commission_pool',
      coalesce(legacy_row.agent_split_percentage, 60),
      20,
      false,
      jsonb_build_object('source', 'phase_3_legacy_structure_sync')
    ),
    (
      v_structure_id,
      'agency_share',
      'agency',
      'agency',
      'gross_commission',
      'gross_commission_pool',
      coalesce(legacy_row.agency_split_percentage, 40),
      30,
      false,
      jsonb_build_object('source', 'phase_3_legacy_structure_sync')
    )
  on conflict (
    commission_structure_id,
    allocation_type,
    participant_role,
    scope,
    calculation_basis,
    allocation_pool,
    priority
  ) do update
    set percentage = excluded.percentage,
        fixed_amount = null,
        metadata = coalesce(public.commission_structure_rules.metadata, '{}'::jsonb) || excluded.metadata,
        updated_at = now();

  if v_status = 'active' then
    update public.commission_structures
      set status = 'active',
          is_default = legacy_row.is_default,
          activated_by = coalesce(activated_by, legacy_row.created_by, auth.uid()),
          activated_at = coalesce(activated_at, now()),
          archived_at = null,
          updated_at = now()
    where id = v_structure_id;
  end if;

  return v_structure_id;
end;
$$;

create or replace function public.bridge_sync_legacy_commission_structure_after_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.bridge_sync_legacy_commission_structure(new.id);
  return new;
end;
$$;

drop trigger if exists trg_legacy_commission_structure_canonical_sync on public.organisation_commission_structures;
create trigger trg_legacy_commission_structure_canonical_sync
after insert or update of
  name,
  listing_commission_type,
  listing_commission_percentage,
  listing_commission_amount,
  agent_split_percentage,
  agency_split_percentage,
  allow_sales_commission_override,
  is_default,
  is_active,
  notes
on public.organisation_commission_structures
for each row
execute function public.bridge_sync_legacy_commission_structure_after_write();

create or replace function public.bridge_resolve_commission_structure(
  p_organisation_id uuid,
  p_transaction_id uuid default null,
  p_participant_user_id uuid default null,
  p_participant_email text default null,
  p_transaction_type text default 'default',
  p_property_type text default null,
  p_mandate_type text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_structure public.commission_structures%rowtype;
  v_profile public.organisation_user_commission_profiles%rowtype;
  v_structure_id uuid;
  v_transaction_type text := coalesce(nullif(trim(p_transaction_type), ''), 'default');
  v_email text := nullif(lower(trim(coalesce(p_participant_email, ''))), '');
begin
  if p_organisation_id is null then
    return jsonb_build_object('success', false, 'code', 'organisation_id_required');
  end if;

  if pg_trigger_depth() = 0
     and not public.bridge_is_active_member(p_organisation_id)
     and coalesce(auth.role(), '') <> 'service_role' then
    return jsonb_build_object('success', false, 'code', 'forbidden');
  end if;

  if p_participant_user_id is not null or v_email is not null then
    select *
      into v_profile
    from public.organisation_user_commission_profiles profile
    where profile.organisation_id = p_organisation_id
      and profile.is_active = true
      and (
        (p_participant_user_id is not null and profile.user_id = p_participant_user_id)
        or (v_email is not null and lower(coalesce(profile.email_address, '')) = v_email)
      )
    order by profile.effective_from desc, profile.created_at desc
    limit 1;

    if v_profile.commission_structure_id is not null then
      v_structure_id := v_profile.commission_structure_id;
      perform public.bridge_sync_legacy_commission_structure(v_structure_id);
    end if;
  end if;

  if v_structure_id is null and p_transaction_id is not null then
    select commission_structure_id
      into v_structure_id
    from public.transaction_commissions
    where transaction_id = p_transaction_id
      and commission_structure_id is not null
    order by updated_at desc nulls last, created_at desc nulls last
    limit 1;

    if v_structure_id is not null then
      perform public.bridge_sync_legacy_commission_structure(v_structure_id);
    end if;
  end if;

  if v_structure_id is not null then
    select *
      into v_structure
    from public.commission_structures
    where id = v_structure_id
      and organisation_id = p_organisation_id
      and status = 'active'
    limit 1;
  end if;

  if v_structure.id is null then
    select *
      into v_structure
    from public.commission_structures
    where organisation_id = p_organisation_id
      and status = 'active'
      and is_default = true
      and transaction_type = v_transaction_type
      and (property_type is null or property_type = p_property_type)
      and (mandate_type is null or mandate_type = p_mandate_type)
      and current_date between effective_from and coalesce(effective_to, current_date)
    order by
      case when property_type is not null then 0 else 1 end,
      case when mandate_type is not null then 0 else 1 end,
      effective_from desc,
      created_at desc
    limit 1;
  end if;

  if v_structure.id is null then
    select *
      into v_structure
    from public.commission_structures
    where organisation_id = p_organisation_id
      and status = 'active'
      and is_default = true
      and transaction_type = 'default'
      and current_date between effective_from and coalesce(effective_to, current_date)
    order by effective_from desc, created_at desc
    limit 1;
  end if;

  if v_structure.id is null then
    return jsonb_build_object('success', false, 'code', 'structure_not_found');
  end if;

  return jsonb_build_object(
    'success', true,
    'code', 'resolved',
    'commission_structure_id', v_structure.id,
    'version', v_structure.version,
    'name', v_structure.name,
    'profile_id', v_profile.id
  );
end;
$$;

create or replace function public.bridge_apply_commission_structure_to_transaction(
  p_transaction_id uuid,
  p_commission_structure_id uuid default null,
  p_actor_id uuid default auth.uid()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  tx_row public.transactions%rowtype;
  commission_row public.transaction_commissions%rowtype;
  resolved jsonb;
  structure_row public.commission_structures%rowtype;
  rule_row public.commission_structure_rules%rowtype;
  v_sale_price numeric(14,2);
  v_gross_amount numeric(14,2);
  v_agent_amount numeric(14,2);
  v_agency_amount numeric(14,2);
  v_basis_amount numeric(14,2);
  v_calculated_amount numeric(14,2);
  v_participant_user_id uuid;
  v_participant_org_id uuid;
  v_participant_branch_id uuid;
  v_participant_email text;
  v_participant_name text;
  v_allocation_id uuid;
  v_applied_count integer := 0;
  v_status text;
begin
  if p_transaction_id is null then
    return jsonb_build_object('success', false, 'code', 'transaction_id_required');
  end if;

  select *
    into tx_row
  from public.transactions
  where id = p_transaction_id
  limit 1;

  if tx_row.id is null then
    return jsonb_build_object('success', false, 'code', 'transaction_not_found');
  end if;

  if pg_trigger_depth() = 0
     and not public.bridge_is_org_admin(tx_row.organisation_id)
     and not public.bridge_is_active_member(tx_row.organisation_id)
     and coalesce(auth.role(), '') <> 'service_role' then
    return jsonb_build_object('success', false, 'code', 'forbidden');
  end if;

  select *
    into commission_row
  from public.transaction_commissions
  where transaction_id = tx_row.id
  order by updated_at desc nulls last, created_at desc nulls last
  limit 1;

  if p_commission_structure_id is not null then
    select *
      into structure_row
    from public.commission_structures
    where id = p_commission_structure_id
      and organisation_id = tx_row.organisation_id
      and status = 'active'
    limit 1;

    if structure_row.id is null then
      perform public.bridge_sync_legacy_commission_structure(p_commission_structure_id);
      select *
        into structure_row
      from public.commission_structures
      where id = p_commission_structure_id
        and organisation_id = tx_row.organisation_id
        and status = 'active'
      limit 1;
    end if;
  end if;

  if structure_row.id is null then
    resolved := public.bridge_resolve_commission_structure(
      tx_row.organisation_id,
      tx_row.id,
      coalesce(commission_row.assigned_agent_id, tx_row.assigned_agent_id, tx_row.assigned_user_id),
      coalesce(commission_row.assigned_agent_email, tx_row.assigned_agent_email),
      coalesce(tx_row.transaction_type, 'default'),
      tx_row.property_type,
      null
    );

    if coalesce((resolved->>'success')::boolean, false) is not true then
      return resolved || jsonb_build_object('applied', false, 'transaction_id', tx_row.id);
    end if;

    select *
      into structure_row
    from public.commission_structures
    where id = (resolved->>'commission_structure_id')::uuid
    limit 1;
  end if;

  v_sale_price := coalesce(commission_row.sale_price, tx_row.purchase_price, tx_row.sales_price);
  v_gross_amount := coalesce(
    commission_row.gross_commission_amount,
    tx_row.gross_commission_amount,
    case
      when v_sale_price is not null and coalesce(commission_row.gross_commission_percentage, tx_row.gross_commission_percentage) is not null
        then round((v_sale_price * coalesce(commission_row.gross_commission_percentage, tx_row.gross_commission_percentage)) / 100, 2)
      else null
    end
  );
  v_agent_amount := coalesce(commission_row.agent_commission_amount, tx_row.agent_commission_amount);
  v_agency_amount := coalesce(commission_row.agency_commission_amount, tx_row.agency_commission_amount);
  v_status := case coalesce(commission_row.status, '')
    when 'approved' then 'approved'
    when 'due' then 'due'
    when 'paid' then 'paid'
    when 'waived' then 'waived'
    when 'disputed' then 'disputed'
    when 'cancelled' then 'cancelled'
    else 'projected'
  end;

  update public.transaction_commission_allocations
    set status = 'cancelled',
        metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('cancelled_by', 'phase_3_structure_reapply'),
        updated_at = now()
  where transaction_id = tx_row.id
    and source_referral_id is null
    and allocation_type not in ('internal_referral', 'external_referral')
    and status not in ('paid', 'cancelled')
    and metadata->>'source' = 'phase_3_commission_structure_apply'
    and commission_structure_id is distinct from structure_row.id;

  for rule_row in
    select *
    from public.commission_structure_rules
    where commission_structure_id = structure_row.id
      and allocation_type not in ('internal_referral', 'external_referral')
    order by priority asc, created_at asc
  loop
    v_basis_amount := case rule_row.calculation_basis
      when 'agent_commission' then v_agent_amount
      when 'agency_commission' then v_agency_amount
      when 'fixed_amount' then null
      else v_gross_amount
    end;
    v_calculated_amount := case
      when rule_row.fixed_amount is not null then rule_row.fixed_amount
      when v_basis_amount is not null and rule_row.percentage is not null then round((v_basis_amount * rule_row.percentage) / 100, 2)
      else null
    end;
    v_calculated_amount := greatest(
      coalesce(rule_row.floor_amount, 0),
      coalesce(v_calculated_amount, 0)
    );
    if rule_row.cap_amount is not null then
      v_calculated_amount := least(v_calculated_amount, rule_row.cap_amount);
    end if;

    v_participant_user_id := case rule_row.participant_role
      when 'listing_agent' then coalesce(tx_row.owner_user_id, tx_row.created_by, tx_row.assigned_agent_id, tx_row.assigned_user_id, commission_row.assigned_agent_id)
      when 'selling_agent' then coalesce(commission_row.assigned_agent_id, tx_row.assigned_agent_id, tx_row.assigned_user_id)
      else null
    end;
    v_participant_org_id := case
      when rule_row.participant_role in ('agency', 'principal') then tx_row.organisation_id
      else null
    end;
    v_participant_branch_id := case
      when rule_row.participant_role in ('source_branch', 'target_branch') then tx_row.assigned_branch_id
      else null
    end;
    v_participant_email := case
      when rule_row.participant_role in ('listing_agent', 'selling_agent') then coalesce(commission_row.assigned_agent_email, tx_row.assigned_agent_email)
      else null
    end;
    v_participant_name := case
      when rule_row.participant_role in ('listing_agent', 'selling_agent') then tx_row.assigned_agent
      when rule_row.participant_role = 'agency' then 'Agency'
      else null
    end;

    select id
      into v_allocation_id
    from public.transaction_commission_allocations
    where transaction_id = tx_row.id
      and commission_structure_rule_id = rule_row.id
      and source_referral_id is null
      and status <> 'cancelled'
    limit 1;

    if v_allocation_id is null then
      insert into public.transaction_commission_allocations (
        transaction_id,
        organisation_id,
        commission_structure_id,
        commission_structure_version,
        commission_structure_rule_id,
        allocation_type,
        scope,
        participant_role,
        participant_user_id,
        participant_organisation_id,
        participant_branch_id,
        participant_name,
        participant_email,
        calculation_basis,
        allocation_pool,
        percentage,
        fixed_amount,
        gross_commission_amount_snapshot,
        basis_amount_snapshot,
        calculated_amount,
        approved_amount,
        currency,
        status,
        requires_approval,
        source_snapshot_json,
        metadata,
        created_by
      )
      values (
        tx_row.id,
        tx_row.organisation_id,
        structure_row.id,
        structure_row.version,
        rule_row.id,
        rule_row.allocation_type,
        rule_row.scope,
        rule_row.participant_role,
        v_participant_user_id,
        v_participant_org_id,
        v_participant_branch_id,
        v_participant_name,
        v_participant_email,
        rule_row.calculation_basis,
        rule_row.allocation_pool,
        rule_row.percentage,
        rule_row.fixed_amount,
        v_gross_amount,
        v_basis_amount,
        v_calculated_amount,
        case when v_status in ('approved', 'due', 'paid') then v_calculated_amount else null end,
        'ZAR',
        v_status,
        rule_row.requires_approval,
        jsonb_strip_nulls(jsonb_build_object(
          'transaction_id', tx_row.id,
          'transaction_commission_id', commission_row.id,
          'commission_structure_id', structure_row.id,
          'commission_structure_version', structure_row.version,
          'commission_structure_rule_id', rule_row.id,
          'sale_price', v_sale_price
        )),
        jsonb_build_object('source', 'phase_3_commission_structure_apply'),
        p_actor_id
      )
      returning id into v_allocation_id;
    else
      update public.transaction_commission_allocations
        set commission_structure_id = structure_row.id,
            commission_structure_version = structure_row.version,
            allocation_type = rule_row.allocation_type,
            scope = rule_row.scope,
            participant_role = rule_row.participant_role,
            participant_user_id = v_participant_user_id,
            participant_organisation_id = v_participant_org_id,
            participant_branch_id = v_participant_branch_id,
            participant_name = v_participant_name,
            participant_email = v_participant_email,
            calculation_basis = rule_row.calculation_basis,
            allocation_pool = rule_row.allocation_pool,
            percentage = rule_row.percentage,
            fixed_amount = rule_row.fixed_amount,
            gross_commission_amount_snapshot = v_gross_amount,
            basis_amount_snapshot = v_basis_amount,
            calculated_amount = v_calculated_amount,
            approved_amount = case when v_status in ('approved', 'due', 'paid') then v_calculated_amount else approved_amount end,
            status = v_status,
            requires_approval = rule_row.requires_approval,
            source_snapshot_json = jsonb_strip_nulls(jsonb_build_object(
              'transaction_id', tx_row.id,
              'transaction_commission_id', commission_row.id,
              'commission_structure_id', structure_row.id,
              'commission_structure_version', structure_row.version,
              'commission_structure_rule_id', rule_row.id,
              'sale_price', v_sale_price
            )),
            metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('last_synced_by', 'phase_3_commission_structure_apply'),
            updated_at = now()
      where id = v_allocation_id;
    end if;

    v_applied_count := v_applied_count + 1;
  end loop;

  return jsonb_build_object(
    'success', true,
    'code', 'applied',
    'transaction_id', tx_row.id,
    'commission_structure_id', structure_row.id,
    'commission_structure_version', structure_row.version,
    'applied_rule_count', v_applied_count
  );
end;
$$;

create or replace function public.bridge_apply_commission_structure_after_commission()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.transaction_id is not null then
    perform public.bridge_apply_commission_structure_to_transaction(
      new.transaction_id,
      new.commission_structure_id,
      auth.uid()
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_transaction_commissions_apply_structure on public.transaction_commissions;
create trigger trg_transaction_commissions_apply_structure
after insert or update of
  commission_structure_id,
  sale_price,
  gross_commission_percentage,
  gross_commission_amount,
  agent_commission_amount,
  agency_commission_amount,
  status
on public.transaction_commissions
for each row
execute function public.bridge_apply_commission_structure_after_commission();

create or replace view public.transaction_commission_structure_allocations_v1 as
select
  allocation.id as allocation_id,
  allocation.organisation_id,
  allocation.transaction_id,
  allocation.commission_structure_id,
  structure.name as commission_structure_name,
  allocation.commission_structure_version,
  allocation.commission_structure_rule_id,
  allocation.allocation_type,
  allocation.scope,
  allocation.participant_role,
  allocation.participant_user_id,
  allocation.participant_organisation_id,
  allocation.participant_branch_id,
  allocation.participant_name,
  allocation.participant_email,
  allocation.calculation_basis,
  allocation.allocation_pool,
  allocation.percentage,
  allocation.fixed_amount,
  allocation.gross_commission_amount_snapshot,
  allocation.basis_amount_snapshot,
  allocation.calculated_amount,
  allocation.approved_amount,
  allocation.status,
  allocation.requires_approval,
  allocation.created_at,
  allocation.updated_at
from public.transaction_commission_allocations allocation
left join public.commission_structures structure
  on structure.id = allocation.commission_structure_id
where allocation.source_referral_id is null
  and allocation.metadata->>'source' = 'phase_3_commission_structure_apply';

alter table public.organisation_commission_structures enable row level security;
alter table public.organisation_user_commission_profiles enable row level security;

drop policy if exists organisation_commission_structures_member_select on public.organisation_commission_structures;
create policy organisation_commission_structures_member_select on public.organisation_commission_structures
for select to authenticated
using (public.bridge_is_active_member(organisation_id));

drop policy if exists organisation_commission_structures_admin_write on public.organisation_commission_structures;
create policy organisation_commission_structures_admin_write on public.organisation_commission_structures
for all to authenticated
using (public.bridge_is_org_admin(organisation_id))
with check (public.bridge_is_org_admin(organisation_id));

drop policy if exists organisation_user_commission_profiles_member_select on public.organisation_user_commission_profiles;
create policy organisation_user_commission_profiles_member_select on public.organisation_user_commission_profiles
for select to authenticated
using (
  public.bridge_is_org_admin(organisation_id)
  or user_id = auth.uid()
  or lower(coalesce(email_address, '')) = lower(coalesce(public.bridge_current_email(), ''))
);

drop policy if exists organisation_user_commission_profiles_admin_write on public.organisation_user_commission_profiles;
create policy organisation_user_commission_profiles_admin_write on public.organisation_user_commission_profiles
for all to authenticated
using (public.bridge_is_org_admin(organisation_id))
with check (public.bridge_is_org_admin(organisation_id));

grant select, insert, update, delete on table public.organisation_commission_structures to authenticated;
grant select, insert, update, delete on table public.organisation_user_commission_profiles to authenticated;
grant select on public.commission_structure_validation_v1 to authenticated;
grant select on public.transaction_commission_structure_allocations_v1 to authenticated;
grant execute on function public.bridge_validate_commission_structure(uuid) to authenticated;
grant execute on function public.bridge_activate_commission_structure(uuid, boolean) to authenticated;
grant execute on function public.bridge_sync_legacy_commission_structure(uuid) to authenticated;
grant execute on function public.bridge_sync_legacy_commission_structure_after_write() to authenticated;
grant execute on function public.bridge_resolve_commission_structure(uuid, uuid, uuid, text, text, text, text) to authenticated;
grant execute on function public.bridge_apply_commission_structure_to_transaction(uuid, uuid, uuid) to authenticated;
grant execute on function public.bridge_apply_commission_structure_after_commission() to authenticated;

commit;
