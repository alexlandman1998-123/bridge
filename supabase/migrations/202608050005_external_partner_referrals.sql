-- Phase 5 external partner referrals.
--
-- External Arch9 referrals are payable only when the source and receiving
-- organisations are connected partners. This phase enforces that boundary and
-- mirrors converted external partner referrals into the canonical commission
-- allocation ledger.

begin;

create unique index if not exists transaction_commission_allocations_external_referral_unique_idx
  on public.transaction_commission_allocations (
    transaction_id,
    source_referral_id,
    allocation_type,
    participant_role
  )
  where source_referral_id is not null
    and allocation_type = 'external_referral'
    and status <> 'cancelled';

create index if not exists transaction_commission_allocations_external_referral_reporting_idx
  on public.transaction_commission_allocations (
    organisation_id,
    participant_organisation_id,
    status,
    updated_at desc
  )
  where allocation_type = 'external_referral';

create index if not exists lead_referrals_external_partner_conversion_idx
  on public.lead_referrals (
    target_organisation_id,
    converted_transaction_id,
    status
  )
  where recipient_scope = 'external_arch9';

create index if not exists lead_referrals_external_partner_source_lead_idx
  on public.lead_referrals (
    target_organisation_id,
    source_lead_id,
    status
  )
  where recipient_scope = 'external_arch9'
    and source_lead_id is not null;

create or replace function public.bridge_has_accepted_partner_relationship(
  p_source_organisation_id uuid,
  p_target_organisation_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_source_organisation_id is not null
    and p_target_organisation_id is not null
    and p_source_organisation_id <> p_target_organisation_id
    and (
      exists (
        select 1
        from public.organisation_partners relationship
        where p_source_organisation_id in (relationship.organisation_id, relationship.partner_organisation_id)
          and p_target_organisation_id in (relationship.organisation_id, relationship.partner_organisation_id)
          and lower(coalesce(relationship.status, relationship.relationship_status, '')) = 'accepted'
      )
      or exists (
        select 1
        from public.partner_connections connection
        where p_source_organisation_id in (connection.source_organization_id, connection.target_organization_id)
          and p_target_organisation_id in (connection.source_organization_id, connection.target_organization_id)
          and lower(coalesce(connection.status, '')) = 'connected'
      )
    )
$$;

create or replace function public.bridge_enforce_external_partner_referral()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.recipient_scope = 'external_arch9'
     and new.status in ('accepted', 'contacted', 'working', 'converted', 'commission_due', 'paid') then
    if new.target_organisation_id is null then
      raise exception 'External Arch9 referrals require a target organisation before acceptance.'
        using errcode = '23514';
    end if;

    if not public.bridge_has_accepted_partner_relationship(
      new.source_organisation_id,
      new.target_organisation_id
    ) then
      raise exception 'External Arch9 referrals can only be accepted or converted between connected partner organisations.'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_lead_referrals_external_partner_guard on public.lead_referrals;
create trigger trg_lead_referrals_external_partner_guard
before insert or update of
  recipient_scope,
  source_organisation_id,
  target_organisation_id,
  status
on public.lead_referrals
for each row
execute function public.bridge_enforce_external_partner_referral();

create or replace function public.bridge_sync_external_partner_referral_accounting(
  p_referral_id uuid,
  p_transaction_id uuid default null,
  p_gross_commission_amount numeric default null,
  p_commission_status text default null,
  p_actor_id uuid default auth.uid()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  referral_row public.lead_referrals%rowtype;
  tx_row public.transactions%rowtype;
  commission_row public.transaction_commissions%rowtype;
  source_org_name text;
  v_transaction_id uuid;
  v_link_id uuid;
  v_allocation_id uuid;
  v_commission_structure_id uuid;
  v_commission_structure_version integer;
  v_rule_id uuid;
  v_basis text;
  v_pool text := 'referral_pool';
  v_percentage numeric(7,4);
  v_fixed_amount numeric(14,2);
  v_gross_amount numeric(14,2);
  v_agent_amount numeric(14,2);
  v_agency_amount numeric(14,2);
  v_referral_amount numeric(14,2);
  v_basis_amount numeric(14,2);
  v_calculated_amount numeric(14,2);
  v_allocation_status text;
  v_link_type text;
  v_requires_auth boolean := pg_trigger_depth() = 0 and coalesce(auth.role(), '') <> 'service_role';
begin
  if p_referral_id is null then
    return jsonb_build_object('success', false, 'code', 'referral_id_required');
  end if;

  select *
    into referral_row
  from public.lead_referrals
  where id = p_referral_id
  limit 1;

  if referral_row.id is null then
    return jsonb_build_object('success', false, 'code', 'referral_not_found');
  end if;

  if referral_row.recipient_scope <> 'external_arch9' then
    return jsonb_build_object('success', false, 'code', 'not_external_partner_referral');
  end if;

  if referral_row.target_organisation_id is null then
    return jsonb_build_object('success', false, 'code', 'target_organisation_required');
  end if;

  if referral_row.status not in ('accepted', 'contacted', 'working', 'converted', 'commission_due', 'paid') then
    return jsonb_build_object('success', false, 'code', 'referral_not_accepted');
  end if;

  if not public.bridge_has_accepted_partner_relationship(
    referral_row.source_organisation_id,
    referral_row.target_organisation_id
  ) then
    return jsonb_build_object('success', false, 'code', 'partner_connection_required');
  end if;

  if v_requires_auth and not (
    public.bridge_is_active_member(referral_row.source_organisation_id)
    or public.bridge_is_active_member(referral_row.target_organisation_id)
    or referral_row.source_agent_id = auth.uid()
    or referral_row.target_agent_id = auth.uid()
    or lower(coalesce(referral_row.source_agent_email, '')) = lower(coalesce(public.bridge_current_email(), ''))
    or lower(coalesce(referral_row.target_agent_email, '')) = lower(coalesce(public.bridge_current_email(), ''))
  ) then
    return jsonb_build_object('success', false, 'code', 'forbidden');
  end if;

  v_transaction_id := coalesce(p_transaction_id, referral_row.converted_transaction_id);

  if v_transaction_id is null then
    return jsonb_build_object('success', false, 'code', 'transaction_id_required');
  end if;

  select *
    into tx_row
  from public.transactions
  where id = v_transaction_id
  limit 1;

  if tx_row.id is null then
    return jsonb_build_object('success', false, 'code', 'transaction_not_found');
  end if;

  if tx_row.organisation_id <> referral_row.target_organisation_id then
    return jsonb_build_object('success', false, 'code', 'transaction_org_mismatch');
  end if;

  select *
    into commission_row
  from public.transaction_commissions
  where transaction_id = v_transaction_id
  order by updated_at desc nulls last, created_at desc nulls last
  limit 1;

  v_gross_amount := coalesce(
    p_gross_commission_amount,
    referral_row.gross_commission_amount,
    commission_row.gross_commission_amount,
    tx_row.gross_commission_amount
  );
  v_agent_amount := coalesce(commission_row.agent_commission_amount, tx_row.agent_commission_amount);
  v_agency_amount := coalesce(commission_row.agency_commission_amount, tx_row.agency_commission_amount);
  v_referral_amount := referral_row.referral_commission_amount;
  v_basis := case
    when referral_row.commission_split_basis in (
      'gross_commission',
      'agent_commission',
      'agency_commission',
      'net_commission',
      'referral_commission',
      'fixed_amount'
    ) then referral_row.commission_split_basis
    else 'gross_commission'
  end;
  v_percentage := case
    when v_basis = 'fixed_amount' then null
    else referral_row.commission_split_percentage
  end;
  v_fixed_amount := case
    when v_basis = 'fixed_amount' then coalesce(v_referral_amount, 0)
    else null
  end;
  v_basis_amount := case v_basis
    when 'agent_commission' then v_agent_amount
    when 'agency_commission' then v_agency_amount
    when 'referral_commission' then v_referral_amount
    when 'fixed_amount' then null
    else v_gross_amount
  end;
  v_calculated_amount := case
    when v_fixed_amount is not null then v_fixed_amount
    when v_basis_amount is not null and v_percentage is not null then round((v_basis_amount * v_percentage) / 100, 2)
    else v_referral_amount
  end;
  v_allocation_status := case coalesce(p_commission_status, referral_row.commission_status, '')
    when 'paid' then 'paid'
    when 'due' then 'due'
    when 'waived' then 'waived'
    when 'disputed' then 'disputed'
    else case
      when referral_row.status = 'paid' then 'paid'
      when referral_row.status = 'commission_due' then 'due'
      when v_calculated_amount is not null and v_calculated_amount > 0 then 'pending_approval'
      else 'projected'
    end
  end;
  v_link_type := case
    when referral_row.referral_type = 'listing_collaboration' then 'listing_collaboration'
    when referral_row.referral_type = 'buyer_introduction' then 'buyer_introduction'
    else 'external_referral'
  end;

  select name
    into source_org_name
  from public.organisations
  where id = referral_row.source_organisation_id
  limit 1;

  v_commission_structure_id := commission_row.commission_structure_id;
  v_commission_structure_version := commission_row.commission_structure_version;

  if v_commission_structure_id is null then
    select structure.id, structure.version
      into v_commission_structure_id, v_commission_structure_version
    from public.commission_structures structure
    where structure.organisation_id = tx_row.organisation_id
      and structure.status = 'active'
      and structure.is_default = true
      and current_date between structure.effective_from and coalesce(structure.effective_to, current_date)
    order by
      case when structure.transaction_type = coalesce(tx_row.transaction_type, 'default') then 0 else 1 end,
      structure.effective_from desc,
      structure.created_at desc
    limit 1;
  end if;

  if v_commission_structure_id is not null then
    select rule.id
      into v_rule_id
    from public.commission_structure_rules rule
    where rule.commission_structure_id = v_commission_structure_id
      and rule.allocation_type = 'external_referral'
      and rule.participant_role = 'external_partner'
      and rule.scope = 'partner'
      and rule.calculation_basis = v_basis
    order by rule.priority asc, rule.created_at asc
    limit 1;
  end if;

  select id
    into v_link_id
  from public.transaction_referral_links
  where transaction_id = v_transaction_id
    and referral_id = referral_row.id
    and status = 'active'
  limit 1;

  if v_link_id is null then
    insert into public.transaction_referral_links (
      transaction_id,
      referral_id,
      organisation_id,
      link_type,
      status,
      protection_period_applied,
      linked_by,
      metadata
    )
    values (
      v_transaction_id,
      referral_row.id,
      tx_row.organisation_id,
      v_link_type,
      'active',
      true,
      p_actor_id,
      jsonb_build_object('source', 'phase_5_external_partner_referrals')
    )
    returning id into v_link_id;
  else
    update public.transaction_referral_links
      set organisation_id = tx_row.organisation_id,
          link_type = v_link_type,
          protection_period_applied = true,
          metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('last_synced_by', 'phase_5_external_partner_referrals'),
          updated_at = now()
    where id = v_link_id;
  end if;

  select id
    into v_allocation_id
  from public.transaction_commission_allocations
  where transaction_id = v_transaction_id
    and source_referral_id = referral_row.id
    and allocation_type = 'external_referral'
    and participant_role = 'external_partner'
    and status <> 'cancelled'
  limit 1;

  if v_allocation_id is null then
    insert into public.transaction_commission_allocations (
      transaction_id,
      organisation_id,
      source_referral_id,
      transaction_referral_link_id,
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
      approved_by,
      approved_at,
      due_at,
      paid_at,
      source_snapshot_json,
      metadata,
      created_by
    )
    values (
      v_transaction_id,
      tx_row.organisation_id,
      referral_row.id,
      v_link_id,
      v_commission_structure_id,
      v_commission_structure_version,
      v_rule_id,
      'external_referral',
      'partner',
      'external_partner',
      referral_row.source_agent_id,
      referral_row.source_organisation_id,
      referral_row.source_branch_id,
      coalesce(referral_row.source_agent_name, source_org_name),
      referral_row.source_agent_email,
      v_basis,
      v_pool,
      v_percentage,
      v_fixed_amount,
      v_gross_amount,
      v_basis_amount,
      v_calculated_amount,
      case when v_allocation_status in ('approved', 'due', 'paid') then v_calculated_amount else null end,
      'ZAR',
      v_allocation_status,
      true,
      case when v_allocation_status in ('approved', 'due', 'paid') then p_actor_id else null end,
      case when v_allocation_status in ('approved', 'due', 'paid') then now() else null end,
      case when v_allocation_status = 'due' then coalesce(referral_row.commission_due_at, now()) else referral_row.commission_due_at end,
      case when v_allocation_status = 'paid' then referral_row.commission_paid_at else null end,
      jsonb_strip_nulls(jsonb_build_object(
        'referral_id', referral_row.id,
        'recipient_scope', referral_row.recipient_scope,
        'referral_type', referral_row.referral_type,
        'source_organisation_id', referral_row.source_organisation_id,
        'target_organisation_id', referral_row.target_organisation_id,
        'commission_split_percentage', referral_row.commission_split_percentage,
        'commission_split_basis', referral_row.commission_split_basis,
        'commission_status', referral_row.commission_status,
        'converted_transaction_id', v_transaction_id
      )),
      jsonb_build_object('source', 'phase_5_external_partner_referrals'),
      p_actor_id
    )
    returning id into v_allocation_id;
  else
    update public.transaction_commission_allocations
      set transaction_referral_link_id = v_link_id,
          commission_structure_id = v_commission_structure_id,
          commission_structure_version = v_commission_structure_version,
          commission_structure_rule_id = v_rule_id,
          participant_user_id = referral_row.source_agent_id,
          participant_organisation_id = referral_row.source_organisation_id,
          participant_branch_id = referral_row.source_branch_id,
          participant_name = coalesce(referral_row.source_agent_name, source_org_name),
          participant_email = referral_row.source_agent_email,
          calculation_basis = v_basis,
          allocation_pool = v_pool,
          percentage = v_percentage,
          fixed_amount = v_fixed_amount,
          gross_commission_amount_snapshot = v_gross_amount,
          basis_amount_snapshot = v_basis_amount,
          calculated_amount = v_calculated_amount,
          approved_amount = case when v_allocation_status in ('approved', 'due', 'paid') then v_calculated_amount else approved_amount end,
          status = v_allocation_status,
          requires_approval = true,
          approved_by = case when v_allocation_status in ('approved', 'due', 'paid') then coalesce(approved_by, p_actor_id) else approved_by end,
          approved_at = case when v_allocation_status in ('approved', 'due', 'paid') then coalesce(approved_at, now()) else approved_at end,
          due_at = case when v_allocation_status = 'due' then coalesce(referral_row.commission_due_at, due_at, now()) else due_at end,
          paid_at = case when v_allocation_status = 'paid' then coalesce(referral_row.commission_paid_at, paid_at, now()) else paid_at end,
          source_snapshot_json = jsonb_strip_nulls(jsonb_build_object(
            'referral_id', referral_row.id,
            'recipient_scope', referral_row.recipient_scope,
            'referral_type', referral_row.referral_type,
            'source_organisation_id', referral_row.source_organisation_id,
            'target_organisation_id', referral_row.target_organisation_id,
            'commission_split_percentage', referral_row.commission_split_percentage,
            'commission_split_basis', referral_row.commission_split_basis,
            'commission_status', referral_row.commission_status,
            'converted_transaction_id', v_transaction_id
          )),
          metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('last_synced_by', 'phase_5_external_partner_referrals'),
          updated_at = now()
    where id = v_allocation_id;
  end if;

  update public.lead_referrals
    set converted_transaction_id = coalesce(converted_transaction_id, v_transaction_id),
        converted_at = coalesce(converted_at, now()),
        status = case
          when status in ('commission_due', 'paid') then status
          else 'converted'
        end,
        gross_commission_amount = coalesce(gross_commission_amount, v_gross_amount),
        referral_commission_amount = coalesce(referral_commission_amount, v_calculated_amount),
        commission_status = case
          when commission_status in ('due', 'paid', 'waived', 'disputed') then commission_status
          when coalesce(v_calculated_amount, 0) > 0 then 'pending'
          else commission_status
        end,
        updated_at = now()
  where id = referral_row.id;

  return jsonb_build_object(
    'success', true,
    'code', 'synced',
    'referral_id', referral_row.id,
    'transaction_id', v_transaction_id,
    'transaction_organisation_id', tx_row.organisation_id,
    'source_organisation_id', referral_row.source_organisation_id,
    'target_organisation_id', referral_row.target_organisation_id,
    'transaction_referral_link_id', v_link_id,
    'allocation_id', v_allocation_id,
    'allocation_status', v_allocation_status,
    'calculated_amount', v_calculated_amount
  );
end;
$$;

create or replace function public.bridge_sync_external_partner_referral_accounting_after_referral()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  if new.recipient_scope = 'external_arch9'
     and new.converted_transaction_id is not null
     and new.status in ('accepted', 'contacted', 'working', 'converted', 'commission_due', 'paid') then
    perform public.bridge_sync_external_partner_referral_accounting(
      new.id,
      new.converted_transaction_id,
      new.gross_commission_amount,
      new.commission_status,
      coalesce(new.accepted_by_user_id, auth.uid())
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_lead_referrals_external_partner_accounting on public.lead_referrals;
create trigger trg_lead_referrals_external_partner_accounting
after insert or update of
  recipient_scope,
  status,
  target_organisation_id,
  converted_transaction_id,
  gross_commission_amount,
  referral_commission_amount,
  commission_split_percentage,
  commission_split_basis,
  commission_status,
  commission_due_at,
  commission_paid_at
on public.lead_referrals
for each row
execute function public.bridge_sync_external_partner_referral_accounting_after_referral();

create or replace function public.bridge_sync_external_partner_referral_accounting_after_commission()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  referral_row record;
begin
  if new.transaction_id is null then
    return new;
  end if;

  for referral_row in
    select id, commission_status
    from public.lead_referrals
    where recipient_scope = 'external_arch9'
      and converted_transaction_id = new.transaction_id
      and status in ('accepted', 'contacted', 'working', 'converted', 'commission_due', 'paid')
  loop
    perform public.bridge_sync_external_partner_referral_accounting(
      referral_row.id,
      new.transaction_id,
      new.gross_commission_amount,
      referral_row.commission_status,
      auth.uid()
    );
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_transaction_commissions_external_partner_accounting on public.transaction_commissions;
create trigger trg_transaction_commissions_external_partner_accounting
after insert or update of
  transaction_id,
  gross_commission_amount,
  agent_commission_amount,
  agency_commission_amount,
  status
on public.transaction_commissions
for each row
execute function public.bridge_sync_external_partner_referral_accounting_after_commission();

create or replace function public.bridge_sync_external_partner_referrals_after_transaction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  referral_row record;
begin
  if new.organisation_id is null then
    return new;
  end if;

  for referral_row in
    select referral.id
    from public.lead_referrals referral
    where referral.recipient_scope = 'external_arch9'
      and referral.target_organisation_id = new.organisation_id
      and referral.status in ('accepted', 'contacted', 'working', 'converted', 'commission_due', 'paid')
      and (
        referral.converted_transaction_id = new.id
        or (
          referral.source_lead_id is not null
          and referral.source_lead_id in (new.originating_lead_id, new.originating_buyer_lead_id)
        )
        or (
          referral.referral_type = 'listing_collaboration'
          and referral.related_listing_id is not null
          and referral.related_listing_id = new.listing_id
        )
      )
  loop
    perform public.bridge_sync_external_partner_referral_accounting(
      referral_row.id,
      new.id,
      null,
      null,
      auth.uid()
    );
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_transactions_external_partner_referral_accounting on public.transactions;
create trigger trg_transactions_external_partner_referral_accounting
after insert or update of
  accepted_offer_id,
  originating_lead_id,
  originating_buyer_lead_id,
  listing_id,
  purchase_price,
  sales_price,
  gross_commission_percentage,
  gross_commission_amount
on public.transactions
for each row
execute function public.bridge_sync_external_partner_referrals_after_transaction();

create or replace view public.external_partner_referral_commission_accounting_v1 as
select
  allocation.id as allocation_id,
  allocation.organisation_id as transaction_organisation_id,
  allocation.transaction_id,
  allocation.source_referral_id as referral_id,
  allocation.transaction_referral_link_id,
  allocation.participant_organisation_id as referring_organisation_id,
  source_org.name as referring_organisation_name,
  allocation.participant_user_id as referring_agent_id,
  allocation.participant_branch_id as referring_branch_id,
  allocation.participant_name as referring_agent_name,
  allocation.participant_email as referring_agent_email,
  referral.target_organisation_id as receiving_organisation_id,
  target_org.name as receiving_organisation_name,
  referral.target_agent_id as receiving_agent_id,
  referral.target_branch_id as receiving_branch_id,
  referral.target_agent_name as receiving_agent_name,
  referral.target_agent_email as receiving_agent_email,
  allocation.percentage,
  allocation.fixed_amount,
  allocation.calculation_basis,
  allocation.allocation_pool,
  allocation.gross_commission_amount_snapshot,
  allocation.basis_amount_snapshot,
  allocation.calculated_amount,
  allocation.approved_amount,
  allocation.status as allocation_status,
  allocation.requires_approval,
  allocation.due_at,
  allocation.paid_at,
  referral.status as referral_status,
  referral.commission_status as referral_commission_status,
  allocation.created_at,
  allocation.updated_at
from public.transaction_commission_allocations allocation
join public.lead_referrals referral
  on referral.id = allocation.source_referral_id
left join public.organisations source_org
  on source_org.id = allocation.participant_organisation_id
left join public.organisations target_org
  on target_org.id = referral.target_organisation_id
where allocation.allocation_type = 'external_referral'
  and allocation.scope = 'partner';

grant execute on function public.bridge_has_accepted_partner_relationship(uuid, uuid) to authenticated;
grant execute on function public.bridge_enforce_external_partner_referral() to authenticated;
grant execute on function public.bridge_sync_external_partner_referral_accounting(uuid, uuid, numeric, text, uuid) to authenticated;
grant execute on function public.bridge_sync_external_partner_referral_accounting_after_referral() to authenticated;
grant execute on function public.bridge_sync_external_partner_referral_accounting_after_commission() to authenticated;
grant execute on function public.bridge_sync_external_partner_referrals_after_transaction() to authenticated;
grant select on public.external_partner_referral_commission_accounting_v1 to authenticated;

commit;
