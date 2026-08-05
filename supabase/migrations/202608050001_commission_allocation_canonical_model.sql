-- Phase 1 canonical commission allocation model.
--
-- This is intentionally additive. Existing transaction_commissions and
-- lead_referrals remain compatible sources while this ledger becomes the
-- future source of truth for multi-party commission entitlement.

begin;

create extension if not exists "pgcrypto" with schema extensions;

create table if not exists public.commission_structures (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  name text not null,
  transaction_type text not null default 'default',
  property_type text,
  mandate_type text,
  version integer not null default 1,
  status text not null default 'draft',
  is_default boolean not null default false,
  effective_from date not null default current_date,
  effective_to date,
  created_by uuid references public.profiles(id) on delete set null,
  activated_by uuid references public.profiles(id) on delete set null,
  activated_at timestamptz,
  archived_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint commission_structures_status_check
    check (status in ('draft', 'active', 'archived')),
  constraint commission_structures_version_check
    check (version > 0),
  constraint commission_structures_effective_window_check
    check (effective_to is null or effective_to >= effective_from)
);

create unique index if not exists commission_structures_org_name_version_idx
  on public.commission_structures (organisation_id, lower(name), version);

create unique index if not exists commission_structures_default_active_idx
  on public.commission_structures (
    organisation_id,
    transaction_type,
    coalesce(property_type, ''),
    coalesce(mandate_type, '')
  )
  where is_default = true and status = 'active';

create index if not exists commission_structures_org_status_idx
  on public.commission_structures (organisation_id, status, is_default, effective_from desc);

drop trigger if exists trg_commission_structures_updated_at on public.commission_structures;
create trigger trg_commission_structures_updated_at
before update on public.commission_structures
for each row
execute function public.set_updated_at_timestamp();

create table if not exists public.commission_structure_rules (
  id uuid primary key default gen_random_uuid(),
  commission_structure_id uuid not null references public.commission_structures(id) on delete cascade,
  allocation_type text not null,
  participant_role text not null,
  scope text not null default 'internal',
  calculation_basis text not null default 'gross_commission',
  allocation_pool text not null default 'gross_commission_pool',
  percentage numeric(7,4),
  fixed_amount numeric(14,2),
  cap_amount numeric(14,2),
  floor_amount numeric(14,2),
  priority integer not null default 100,
  requires_approval boolean not null default false,
  applies_when_json jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint commission_structure_rules_allocation_type_check
    check (allocation_type in (
      'listing_commission',
      'selling_commission',
      'internal_referral',
      'external_referral',
      'agency_share',
      'branch_share',
      'manager_override',
      'custom'
    )),
  constraint commission_structure_rules_participant_role_check
    check (participant_role in (
      'listing_agent',
      'selling_agent',
      'referring_agent',
      'source_branch',
      'target_branch',
      'agency',
      'principal',
      'manager',
      'external_partner',
      'custom'
    )),
  constraint commission_structure_rules_scope_check
    check (scope in ('internal', 'external', 'partner', 'branch', 'agency')),
  constraint commission_structure_rules_basis_check
    check (calculation_basis in (
      'gross_commission',
      'agent_commission',
      'agency_commission',
      'net_commission',
      'referral_commission',
      'fixed_amount'
    )),
  constraint commission_structure_rules_pool_check
    check (allocation_pool in (
      'gross_commission_pool',
      'agent_commission_pool',
      'agency_commission_pool',
      'branch_pool',
      'referral_pool',
      'fixed_pool'
    )),
  constraint commission_structure_rules_percentage_check
    check (percentage is null or percentage between 0 and 100),
  constraint commission_structure_rules_fixed_amount_check
    check (fixed_amount is null or fixed_amount >= 0),
  constraint commission_structure_rules_cap_floor_check
    check (
      (cap_amount is null or cap_amount >= 0)
      and (floor_amount is null or floor_amount >= 0)
      and (cap_amount is null or floor_amount is null or cap_amount >= floor_amount)
    ),
  constraint commission_structure_rules_value_check
    check (
      percentage is not null
      or fixed_amount is not null
      or allocation_type = 'manager_override'
    )
);

create index if not exists commission_structure_rules_structure_idx
  on public.commission_structure_rules (commission_structure_id, priority, allocation_type);

create index if not exists commission_structure_rules_basis_pool_idx
  on public.commission_structure_rules (commission_structure_id, calculation_basis, allocation_pool);

create unique index if not exists commission_structure_rules_natural_unique_idx
  on public.commission_structure_rules (
    commission_structure_id,
    allocation_type,
    participant_role,
    scope,
    calculation_basis,
    allocation_pool,
    priority
  );

drop trigger if exists trg_commission_structure_rules_updated_at on public.commission_structure_rules;
create trigger trg_commission_structure_rules_updated_at
before update on public.commission_structure_rules
for each row
execute function public.set_updated_at_timestamp();

create table if not exists public.transaction_referral_links (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  referral_id uuid not null references public.lead_referrals(id) on delete cascade,
  organisation_id uuid references public.organisations(id) on delete set null,
  link_type text not null default 'accepted_referral',
  status text not null default 'active',
  protection_period_applied boolean not null default false,
  linked_at timestamptz not null default now(),
  linked_by uuid references public.profiles(id) on delete set null,
  superseded_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transaction_referral_links_type_check
    check (link_type in (
      'internal_referral',
      'external_referral',
      'buyer_introduction',
      'listing_collaboration',
      'accepted_referral',
      'manual_link'
    )),
  constraint transaction_referral_links_status_check
    check (status in ('active', 'superseded', 'cancelled', 'disputed'))
);

create unique index if not exists transaction_referral_links_unique_active_idx
  on public.transaction_referral_links (transaction_id, referral_id)
  where status = 'active';

create index if not exists transaction_referral_links_transaction_idx
  on public.transaction_referral_links (transaction_id, status, linked_at desc);

create index if not exists transaction_referral_links_referral_idx
  on public.transaction_referral_links (referral_id, status, linked_at desc);

drop trigger if exists trg_transaction_referral_links_updated_at on public.transaction_referral_links;
create trigger trg_transaction_referral_links_updated_at
before update on public.transaction_referral_links
for each row
execute function public.set_updated_at_timestamp();

create table if not exists public.transaction_commission_allocations (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  source_referral_id uuid references public.lead_referrals(id) on delete set null,
  transaction_referral_link_id uuid references public.transaction_referral_links(id) on delete set null,
  commission_structure_id uuid references public.commission_structures(id) on delete set null,
  commission_structure_version integer,
  commission_structure_rule_id uuid references public.commission_structure_rules(id) on delete set null,
  allocation_type text not null,
  scope text not null default 'internal',
  participant_role text not null,
  participant_user_id uuid references public.profiles(id) on delete set null,
  participant_organisation_id uuid references public.organisations(id) on delete set null,
  participant_branch_id uuid references public.organisation_branches(id) on delete set null,
  participant_name text,
  participant_email text,
  calculation_basis text not null default 'gross_commission',
  allocation_pool text not null default 'gross_commission_pool',
  percentage numeric(7,4),
  fixed_amount numeric(14,2),
  gross_commission_amount_snapshot numeric(14,2),
  basis_amount_snapshot numeric(14,2),
  calculated_amount numeric(14,2),
  approved_amount numeric(14,2),
  currency text not null default 'ZAR',
  status text not null default 'projected',
  requires_approval boolean not null default false,
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  due_at timestamptz,
  paid_at timestamptz,
  payment_reference text,
  waived_at timestamptz,
  waived_by uuid references public.profiles(id) on delete set null,
  dispute_reason text,
  override_reason text,
  locked_at timestamptz,
  source_snapshot_json jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transaction_commission_allocations_allocation_type_check
    check (allocation_type in (
      'listing_commission',
      'selling_commission',
      'internal_referral',
      'external_referral',
      'agency_share',
      'branch_share',
      'manager_override',
      'custom'
    )),
  constraint transaction_commission_allocations_scope_check
    check (scope in ('internal', 'external', 'partner', 'branch', 'agency')),
  constraint transaction_commission_allocations_participant_role_check
    check (participant_role in (
      'listing_agent',
      'selling_agent',
      'referring_agent',
      'source_branch',
      'target_branch',
      'agency',
      'principal',
      'manager',
      'external_partner',
      'custom'
    )),
  constraint transaction_commission_allocations_basis_check
    check (calculation_basis in (
      'gross_commission',
      'agent_commission',
      'agency_commission',
      'net_commission',
      'referral_commission',
      'fixed_amount'
    )),
  constraint transaction_commission_allocations_pool_check
    check (allocation_pool in (
      'gross_commission_pool',
      'agent_commission_pool',
      'agency_commission_pool',
      'branch_pool',
      'referral_pool',
      'fixed_pool'
    )),
  constraint transaction_commission_allocations_status_check
    check (status in (
      'projected',
      'pending_approval',
      'approved',
      'due',
      'paid',
      'waived',
      'disputed',
      'cancelled'
    )),
  constraint transaction_commission_allocations_percentage_check
    check (percentage is null or percentage between 0 and 100),
  constraint transaction_commission_allocations_amount_check
    check (
      (fixed_amount is null or fixed_amount >= 0)
      and (gross_commission_amount_snapshot is null or gross_commission_amount_snapshot >= 0)
      and (basis_amount_snapshot is null or basis_amount_snapshot >= 0)
      and (calculated_amount is null or calculated_amount >= 0)
      and (approved_amount is null or approved_amount >= 0)
    ),
  constraint transaction_commission_allocations_currency_check
    check (currency ~ '^[A-Z]{3}$'),
  constraint transaction_commission_allocations_version_check
    check (commission_structure_version is null or commission_structure_version > 0)
);

create index if not exists transaction_commission_allocations_transaction_idx
  on public.transaction_commission_allocations (transaction_id, status, allocation_type);

create index if not exists transaction_commission_allocations_org_status_idx
  on public.transaction_commission_allocations (organisation_id, status, updated_at desc);

create index if not exists transaction_commission_allocations_participant_idx
  on public.transaction_commission_allocations (participant_user_id, status, updated_at desc)
  where participant_user_id is not null;

create index if not exists transaction_commission_allocations_referral_idx
  on public.transaction_commission_allocations (source_referral_id, status)
  where source_referral_id is not null;

create index if not exists transaction_commission_allocations_rule_idx
  on public.transaction_commission_allocations (commission_structure_id, commission_structure_rule_id)
  where commission_structure_id is not null;

drop trigger if exists trg_transaction_commission_allocations_updated_at on public.transaction_commission_allocations;
create trigger trg_transaction_commission_allocations_updated_at
before update on public.transaction_commission_allocations
for each row
execute function public.set_updated_at_timestamp();

create or replace view public.commission_structure_rule_pool_totals as
select
  structure.organisation_id,
  rule.commission_structure_id,
  rule.calculation_basis,
  rule.allocation_pool,
  count(*)::integer as rule_count,
  coalesce(sum(rule.percentage), 0)::numeric(10,4) as percentage_total,
  coalesce(sum(rule.fixed_amount), 0)::numeric(14,2) as fixed_amount_total
from public.commission_structure_rules rule
join public.commission_structures structure
  on structure.id = rule.commission_structure_id
group by
  structure.organisation_id,
  rule.commission_structure_id,
  rule.calculation_basis,
  rule.allocation_pool;

create or replace view public.referral_commission_allocation_mapping_v1 as
select
  referral.id as referral_id,
  referral.source_organisation_id,
  referral.target_organisation_id,
  referral.source_agent_id,
  referral.target_agent_id,
  referral.source_branch_id,
  referral.target_branch_id,
  referral.source_lead_id,
  referral.related_listing_id,
  referral.referral_type,
  referral.recipient_scope,
  referral.status as referral_status,
  referral.agreement_status,
  referral.commission_split_percentage,
  referral.commission_split_basis,
  referral.converted_transaction_id,
  referral.gross_commission_amount,
  referral.referral_commission_amount,
  referral.commission_status,
  case
    when referral.recipient_scope = 'internal' then 'internal_referral'
    when referral.referral_type = 'listing_collaboration' then 'listing_collaboration'
    when referral.referral_type = 'buyer_introduction' then 'buyer_introduction'
    else 'external_referral'
  end as suggested_link_type,
  case
    when referral.recipient_scope = 'internal' then 'internal'
    when referral.recipient_scope = 'external_arch9' then 'partner'
    else 'external'
  end as suggested_allocation_scope,
  case
    when referral.commission_split_basis in ('gross_commission', 'agent_commission', 'agency_commission', 'net_commission', 'fixed_amount')
      then referral.commission_split_basis
    else 'gross_commission'
  end as suggested_calculation_basis
from public.lead_referrals referral;

create or replace function public.bridge_create_default_commission_structure(
  p_organisation_id uuid,
  p_created_by uuid default auth.uid()
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_structure_id uuid;
begin
  if p_organisation_id is null then
    raise exception 'organisation_id is required'
      using errcode = '23502';
  end if;

  if not public.bridge_is_org_admin(p_organisation_id) then
    raise exception 'Only organisation admins can create default commission structures.'
      using errcode = '42501';
  end if;

  select id
    into v_structure_id
  from public.commission_structures
  where organisation_id = p_organisation_id
    and lower(name) = lower('Residential standard sale')
    and version = 1
  limit 1;

  if v_structure_id is null then
    insert into public.commission_structures (
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
      metadata
    )
    values (
      p_organisation_id,
      'Residential standard sale',
      'default',
      1,
      'active',
      true,
      current_date,
      p_created_by,
      p_created_by,
      now(),
      jsonb_build_object(
        'source', 'phase_1_default_seed',
        'description', 'Default 40/40/20 gross commission split for listing agent, selling agent, and agency share.'
      )
    )
    returning id into v_structure_id;
  end if;

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
      'listing_commission',
      'listing_agent',
      'internal',
      'gross_commission',
      'gross_commission_pool',
      40,
      10,
      false,
      jsonb_build_object('source', 'phase_1_default_seed')
    ),
    (
      v_structure_id,
      'selling_commission',
      'selling_agent',
      'internal',
      'gross_commission',
      'gross_commission_pool',
      40,
      20,
      false,
      jsonb_build_object('source', 'phase_1_default_seed')
    ),
    (
      v_structure_id,
      'agency_share',
      'agency',
      'agency',
      'gross_commission',
      'gross_commission_pool',
      20,
      30,
      false,
      jsonb_build_object('source', 'phase_1_default_seed')
    )
  on conflict do nothing;

  return v_structure_id;
end;
$$;

alter table public.commission_structures enable row level security;
alter table public.commission_structure_rules enable row level security;
alter table public.transaction_referral_links enable row level security;
alter table public.transaction_commission_allocations enable row level security;

drop policy if exists commission_structures_member_select on public.commission_structures;
create policy commission_structures_member_select on public.commission_structures
for select to authenticated
using (public.bridge_is_active_member(organisation_id));

drop policy if exists commission_structures_admin_write on public.commission_structures;
create policy commission_structures_admin_write on public.commission_structures
for all to authenticated
using (public.bridge_is_org_admin(organisation_id))
with check (public.bridge_is_org_admin(organisation_id));

drop policy if exists commission_structure_rules_member_select on public.commission_structure_rules;
create policy commission_structure_rules_member_select on public.commission_structure_rules
for select to authenticated
using (
  exists (
    select 1
    from public.commission_structures structure
    where structure.id = commission_structure_id
      and public.bridge_is_active_member(structure.organisation_id)
  )
);

drop policy if exists commission_structure_rules_admin_write on public.commission_structure_rules;
create policy commission_structure_rules_admin_write on public.commission_structure_rules
for all to authenticated
using (
  exists (
    select 1
    from public.commission_structures structure
    where structure.id = commission_structure_id
      and public.bridge_is_org_admin(structure.organisation_id)
  )
)
with check (
  exists (
    select 1
    from public.commission_structures structure
    where structure.id = commission_structure_id
      and public.bridge_is_org_admin(structure.organisation_id)
  )
);

drop policy if exists transaction_referral_links_member_select on public.transaction_referral_links;
create policy transaction_referral_links_member_select on public.transaction_referral_links
for select to authenticated
using (
  (organisation_id is not null and public.bridge_is_active_member(organisation_id))
  or exists (
    select 1
    from public.transactions tx
    where tx.id = transaction_id
      and public.bridge_is_active_member(tx.organisation_id)
  )
  or exists (
    select 1
    from public.lead_referrals referral
    where referral.id = referral_id
      and (
        public.bridge_is_active_member(referral.source_organisation_id)
        or public.bridge_is_active_member(referral.target_organisation_id)
        or referral.source_agent_id = auth.uid()
        or referral.target_agent_id = auth.uid()
      )
  )
);

drop policy if exists transaction_referral_links_admin_write on public.transaction_referral_links;
create policy transaction_referral_links_admin_write on public.transaction_referral_links
for all to authenticated
using (
  (organisation_id is not null and public.bridge_is_org_admin(organisation_id))
  or exists (
    select 1
    from public.transactions tx
    where tx.id = transaction_id
      and public.bridge_is_org_admin(tx.organisation_id)
  )
)
with check (
  (organisation_id is not null and public.bridge_is_org_admin(organisation_id))
  or exists (
    select 1
    from public.transactions tx
    where tx.id = transaction_id
      and public.bridge_is_org_admin(tx.organisation_id)
  )
);

drop policy if exists transaction_commission_allocations_member_select on public.transaction_commission_allocations;
create policy transaction_commission_allocations_member_select on public.transaction_commission_allocations
for select to authenticated
using (
  public.bridge_is_active_member(organisation_id)
  or participant_user_id = auth.uid()
  or lower(coalesce(participant_email, '')) = lower(public.bridge_current_email())
);

drop policy if exists transaction_commission_allocations_admin_write on public.transaction_commission_allocations;
create policy transaction_commission_allocations_admin_write on public.transaction_commission_allocations
for all to authenticated
using (public.bridge_is_org_admin(organisation_id))
with check (public.bridge_is_org_admin(organisation_id));

grant select, insert, update, delete on table public.commission_structures to authenticated;
grant select, insert, update, delete on table public.commission_structure_rules to authenticated;
grant select, insert, update, delete on table public.transaction_referral_links to authenticated;
grant select, insert, update, delete on table public.transaction_commission_allocations to authenticated;
grant select on public.commission_structure_rule_pool_totals to authenticated;
grant select on public.referral_commission_allocation_mapping_v1 to authenticated;
grant execute on function public.bridge_create_default_commission_structure(uuid, uuid) to authenticated;

commit;
