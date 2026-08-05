-- Phase 2 internal referral accounting.
--
-- Internal referrals stay within one organisation. When an accepted internal
-- referral converts into a transaction, this migration links the referral to
-- the transaction and records the referrer's entitlement in the canonical
-- transaction_commission_allocations ledger introduced in Phase 1.

begin;

alter table if exists public.lead_referrals
  drop constraint if exists lead_referrals_internal_same_org_check;
alter table if exists public.lead_referrals
  add constraint lead_referrals_internal_same_org_check
  check (
    recipient_scope <> 'internal'
    or target_organisation_id is null
    or target_organisation_id = source_organisation_id
  ) not valid;

create unique index if not exists transaction_commission_allocations_internal_referral_unique_idx
  on public.transaction_commission_allocations (
    transaction_id,
    source_referral_id,
    allocation_type,
    participant_role
  )
  where source_referral_id is not null
    and allocation_type = 'internal_referral'
    and status <> 'cancelled';

create index if not exists transaction_commission_allocations_internal_referral_reporting_idx
  on public.transaction_commission_allocations (
    organisation_id,
    participant_user_id,
    status,
    updated_at desc
  )
  where allocation_type = 'internal_referral';

create or replace function public.bridge_sync_internal_referral_accounting(
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
  v_transaction_id uuid;
  v_transaction_org_id uuid;
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

  if referral_row.recipient_scope <> 'internal' then
    return jsonb_build_object('success', false, 'code', 'not_internal_referral');
  end if;

  if referral_row.target_organisation_id is not null
     and referral_row.target_organisation_id <> referral_row.source_organisation_id then
    return jsonb_build_object('success', false, 'code', 'internal_org_mismatch');
  end if;

  if referral_row.status not in ('accepted', 'converted', 'commission_due', 'paid') then
    return jsonb_build_object('success', false, 'code', 'referral_not_accepted');
  end if;

  if v_requires_auth and not (
    public.bridge_is_active_member(referral_row.source_organisation_id)
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

  select tx.organisation_id
    into v_transaction_org_id
  from public.transactions tx
  where tx.id = v_transaction_id
  limit 1;

  if v_transaction_org_id is null then
    return jsonb_build_object('success', false, 'code', 'transaction_not_found');
  end if;

  if v_transaction_org_id <> referral_row.source_organisation_id then
    return jsonb_build_object('success', false, 'code', 'transaction_org_mismatch');
  end if;

  select
    tc.gross_commission_amount,
    tc.agent_commission_amount,
    tc.agency_commission_amount
    into
      v_gross_amount,
      v_agent_amount,
      v_agency_amount
  from public.transaction_commissions tc
  where tc.transaction_id = v_transaction_id
  order by tc.updated_at desc nulls last, tc.created_at desc nulls last
  limit 1;

  v_gross_amount := coalesce(p_gross_commission_amount, referral_row.gross_commission_amount, v_gross_amount);
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
      when v_calculated_amount is not null and v_calculated_amount > 0 then 'projected'
      else 'projected'
    end
  end;

  select structure.id, structure.version
    into v_commission_structure_id, v_commission_structure_version
  from public.commission_structures structure
  where structure.organisation_id = referral_row.source_organisation_id
    and structure.status = 'active'
    and structure.is_default = true
    and current_date between structure.effective_from and coalesce(structure.effective_to, current_date)
  order by structure.effective_from desc, structure.created_at desc
  limit 1;

  if v_commission_structure_id is not null then
    select rule.id
      into v_rule_id
    from public.commission_structure_rules rule
    where rule.commission_structure_id = v_commission_structure_id
      and rule.allocation_type = 'internal_referral'
      and rule.participant_role = 'referring_agent'
      and rule.scope = 'internal'
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
      referral_row.source_organisation_id,
      'internal_referral',
      'active',
      true,
      p_actor_id,
      jsonb_build_object('source', 'phase_2_internal_referral_accounting')
    )
    returning id into v_link_id;
  end if;

  select id
    into v_allocation_id
  from public.transaction_commission_allocations
  where transaction_id = v_transaction_id
    and source_referral_id = referral_row.id
    and allocation_type = 'internal_referral'
    and participant_role = 'referring_agent'
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
      referral_row.source_organisation_id,
      referral_row.id,
      v_link_id,
      v_commission_structure_id,
      v_commission_structure_version,
      v_rule_id,
      'internal_referral',
      'internal',
      'referring_agent',
      referral_row.source_agent_id,
      referral_row.source_organisation_id,
      referral_row.source_branch_id,
      referral_row.source_agent_name,
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
      false,
      case when v_allocation_status in ('approved', 'due', 'paid') then p_actor_id else null end,
      case when v_allocation_status in ('approved', 'due', 'paid') then now() else null end,
      case when v_allocation_status = 'due' then coalesce(referral_row.commission_due_at, now()) else referral_row.commission_due_at end,
      case when v_allocation_status = 'paid' then referral_row.commission_paid_at else null end,
      jsonb_strip_nulls(jsonb_build_object(
        'referral_id', referral_row.id,
        'recipient_scope', referral_row.recipient_scope,
        'referral_type', referral_row.referral_type,
        'commission_split_percentage', referral_row.commission_split_percentage,
        'commission_split_basis', referral_row.commission_split_basis,
        'commission_status', referral_row.commission_status,
        'converted_transaction_id', v_transaction_id
      )),
      jsonb_build_object('source', 'phase_2_internal_referral_accounting'),
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
          participant_name = referral_row.source_agent_name,
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
          approved_by = case when v_allocation_status in ('approved', 'due', 'paid') then coalesce(approved_by, p_actor_id) else approved_by end,
          approved_at = case when v_allocation_status in ('approved', 'due', 'paid') then coalesce(approved_at, now()) else approved_at end,
          due_at = case when v_allocation_status = 'due' then coalesce(referral_row.commission_due_at, due_at, now()) else due_at end,
          paid_at = case when v_allocation_status = 'paid' then coalesce(referral_row.commission_paid_at, paid_at, now()) else paid_at end,
          source_snapshot_json = jsonb_strip_nulls(jsonb_build_object(
            'referral_id', referral_row.id,
            'recipient_scope', referral_row.recipient_scope,
            'referral_type', referral_row.referral_type,
            'commission_split_percentage', referral_row.commission_split_percentage,
            'commission_split_basis', referral_row.commission_split_basis,
            'commission_status', referral_row.commission_status,
            'converted_transaction_id', v_transaction_id
          )),
          metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('last_synced_by', 'phase_2_internal_referral_accounting')
    where id = v_allocation_id;
  end if;

  return jsonb_build_object(
    'success', true,
    'code', 'synced',
    'referral_id', referral_row.id,
    'transaction_id', v_transaction_id,
    'transaction_referral_link_id', v_link_id,
    'allocation_id', v_allocation_id,
    'allocation_status', v_allocation_status,
    'calculated_amount', v_calculated_amount
  );
end;
$$;

create or replace function public.bridge_sync_internal_referral_accounting_after_referral()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.recipient_scope = 'internal'
     and new.converted_transaction_id is not null
     and new.status in ('accepted', 'converted', 'commission_due', 'paid') then
    perform public.bridge_sync_internal_referral_accounting(
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

drop trigger if exists trg_lead_referrals_internal_accounting on public.lead_referrals;
create trigger trg_lead_referrals_internal_accounting
after insert or update of
  recipient_scope,
  status,
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
execute function public.bridge_sync_internal_referral_accounting_after_referral();

create or replace function public.bridge_sync_internal_referral_accounting_after_commission()
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
    where recipient_scope = 'internal'
      and converted_transaction_id = new.transaction_id
      and status in ('accepted', 'converted', 'commission_due', 'paid')
  loop
    perform public.bridge_sync_internal_referral_accounting(
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

drop trigger if exists trg_transaction_commissions_internal_accounting on public.transaction_commissions;
create trigger trg_transaction_commissions_internal_accounting
after insert or update of
  transaction_id,
  gross_commission_amount,
  agent_commission_amount,
  agency_commission_amount,
  status
on public.transaction_commissions
for each row
execute function public.bridge_sync_internal_referral_accounting_after_commission();

create or replace view public.internal_referral_commission_accounting_v1 as
select
  allocation.id as allocation_id,
  allocation.organisation_id,
  allocation.transaction_id,
  allocation.source_referral_id as referral_id,
  allocation.transaction_referral_link_id,
  allocation.participant_user_id as referring_agent_id,
  allocation.participant_branch_id as referring_branch_id,
  allocation.participant_name as referring_agent_name,
  allocation.participant_email as referring_agent_email,
  allocation.percentage,
  allocation.fixed_amount,
  allocation.calculation_basis,
  allocation.allocation_pool,
  allocation.gross_commission_amount_snapshot,
  allocation.basis_amount_snapshot,
  allocation.calculated_amount,
  allocation.approved_amount,
  allocation.status as allocation_status,
  allocation.due_at,
  allocation.paid_at,
  referral.target_agent_id as receiving_agent_id,
  referral.target_branch_id as receiving_branch_id,
  referral.target_agent_name as receiving_agent_name,
  referral.target_agent_email as receiving_agent_email,
  referral.status as referral_status,
  referral.commission_status as referral_commission_status,
  allocation.created_at,
  allocation.updated_at
from public.transaction_commission_allocations allocation
join public.lead_referrals referral
  on referral.id = allocation.source_referral_id
where allocation.allocation_type = 'internal_referral'
  and allocation.scope = 'internal';

grant execute on function public.bridge_sync_internal_referral_accounting(uuid, uuid, numeric, text, uuid) to authenticated;
grant execute on function public.bridge_sync_internal_referral_accounting_after_referral() to authenticated;
grant execute on function public.bridge_sync_internal_referral_accounting_after_commission() to authenticated;
grant select on public.internal_referral_commission_accounting_v1 to authenticated;

commit;
