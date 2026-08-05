-- Phase 4 transaction conversion commission hook.
--
-- Conversion paths can create transactions without touching
-- transaction_commissions. This hook makes the conversion boundary canonical:
-- when a lead/offer-backed transaction appears or changes, it creates or
-- normalizes the commission snapshot, applies the active commission structure,
-- and links converted referrals into the canonical allocation ledger.

begin;

create index if not exists transaction_commissions_conversion_hook_idx
  on public.transaction_commissions (transaction_id, updated_at desc)
  where transaction_id is not null;

create index if not exists lead_referrals_conversion_hook_source_lead_idx
  on public.lead_referrals (source_organisation_id, source_lead_id, status)
  where source_lead_id is not null;

create index if not exists lead_referrals_conversion_hook_listing_idx
  on public.lead_referrals (source_organisation_id, related_listing_id, referral_type, status)
  where related_listing_id is not null;

create or replace function public.bridge_apply_transaction_conversion_commission_hook(
  p_transaction_id uuid,
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
  structure_row public.commission_structures%rowtype;
  resolved jsonb;
  referral_row public.lead_referrals%rowtype;
  referral_result jsonb;
  v_structure_id uuid;
  v_sale_price numeric(14,2);
  v_gross_percentage numeric(7,4);
  v_gross_amount numeric(14,2);
  v_agent_split_percentage numeric(7,4);
  v_agency_split_percentage numeric(7,4);
  v_agent_amount numeric(14,2);
  v_agency_amount numeric(14,2);
  v_referral_basis_amount numeric(14,2);
  v_referral_amount numeric(14,2);
  v_link_type text;
  v_commission_id uuid;
  v_applied jsonb := '{}'::jsonb;
  v_referral_count integer := 0;
  v_internal_referral_count integer := 0;
  v_external_referral_count integer := 0;
  v_requires_auth boolean := pg_trigger_depth() = 0 and coalesce(auth.role(), '') <> 'service_role';
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

  if v_requires_auth and not public.bridge_is_active_member(tx_row.organisation_id) then
    return jsonb_build_object('success', false, 'code', 'forbidden');
  end if;

  select *
    into commission_row
  from public.transaction_commissions
  where transaction_id = tx_row.id
  order by updated_at desc nulls last, created_at desc nulls last
  limit 1;

  if commission_row.commission_structure_id is not null then
    v_structure_id := commission_row.commission_structure_id;
  else
    resolved := public.bridge_resolve_commission_structure(
      tx_row.organisation_id,
      tx_row.id,
      coalesce(tx_row.assigned_agent_id, tx_row.assigned_user_id, tx_row.owner_user_id),
      tx_row.assigned_agent_email,
      coalesce(tx_row.transaction_type, 'default'),
      tx_row.property_type,
      null
    );

    if coalesce((resolved->>'success')::boolean, false) then
      v_structure_id := (resolved->>'commission_structure_id')::uuid;
    end if;
  end if;

  if v_structure_id is not null then
    select *
      into structure_row
    from public.commission_structures
    where id = v_structure_id
      and organisation_id = tx_row.organisation_id
      and status = 'active'
    limit 1;
  end if;

  v_sale_price := coalesce(commission_row.sale_price, tx_row.purchase_price, tx_row.sales_price);
  v_gross_percentage := coalesce(commission_row.gross_commission_percentage, tx_row.gross_commission_percentage);

  if v_gross_percentage is null
     and structure_row.id is not null
     and structure_row.metadata->>'listing_commission_type' = 'percentage' then
    v_gross_percentage := nullif(structure_row.metadata->>'listing_commission_percentage', '')::numeric;
  end if;

  v_gross_amount := coalesce(
    commission_row.gross_commission_amount,
    tx_row.gross_commission_amount,
    case
      when v_sale_price is not null and v_gross_percentage is not null
        then round((v_sale_price * v_gross_percentage) / 100, 2)
      when structure_row.id is not null
           and structure_row.metadata->>'listing_commission_type' = 'fixed'
        then nullif(structure_row.metadata->>'listing_commission_amount', '')::numeric
      else null
    end
  );

  v_agent_split_percentage := coalesce(
    commission_row.agent_split_percentage_snapshot,
    tx_row.agent_split_percentage_snapshot
  );
  v_agency_split_percentage := coalesce(
    commission_row.agency_split_percentage_snapshot,
    tx_row.agency_split_percentage_snapshot
  );

  if structure_row.id is not null and v_agent_split_percentage is null then
    select rule.percentage
      into v_agent_split_percentage
    from public.commission_structure_rules rule
    where rule.commission_structure_id = structure_row.id
      and rule.allocation_type = 'selling_commission'
      and rule.participant_role = 'selling_agent'
      and rule.calculation_basis = 'gross_commission'
    order by rule.priority asc, rule.created_at asc
    limit 1;
  end if;

  if structure_row.id is not null and v_agency_split_percentage is null then
    select rule.percentage
      into v_agency_split_percentage
    from public.commission_structure_rules rule
    where rule.commission_structure_id = structure_row.id
      and rule.allocation_type = 'agency_share'
      and rule.participant_role in ('agency', 'principal')
      and rule.calculation_basis = 'gross_commission'
    order by rule.priority asc, rule.created_at asc
    limit 1;
  end if;

  v_agent_amount := coalesce(
    commission_row.agent_commission_amount,
    tx_row.agent_commission_amount,
    case
      when v_gross_amount is not null and v_agent_split_percentage is not null
        then round((v_gross_amount * v_agent_split_percentage) / 100, 2)
      else null
    end
  );
  v_agency_amount := coalesce(
    commission_row.agency_commission_amount,
    tx_row.agency_commission_amount,
    case
      when v_gross_amount is not null and v_agency_split_percentage is not null
        then round((v_gross_amount * v_agency_split_percentage) / 100, 2)
      else null
    end
  );

  if commission_row.id is null then
    insert into public.transaction_commissions (
      organisation_id,
      transaction_id,
      assigned_agent_id,
      assigned_agent_email,
      sale_price,
      gross_commission_percentage,
      gross_commission_amount,
      agent_split_percentage_snapshot,
      agency_split_percentage_snapshot,
      agent_commission_amount,
      agency_commission_amount,
      commission_structure_id,
      commission_structure_version,
      commission_structure_name_snapshot,
      status,
      created_at,
      updated_at
    )
    values (
      tx_row.organisation_id,
      tx_row.id,
      coalesce(tx_row.assigned_agent_id, tx_row.assigned_user_id, tx_row.owner_user_id),
      tx_row.assigned_agent_email,
      v_sale_price,
      v_gross_percentage,
      v_gross_amount,
      v_agent_split_percentage,
      v_agency_split_percentage,
      v_agent_amount,
      v_agency_amount,
      structure_row.id,
      structure_row.version,
      structure_row.name,
      'draft',
      now(),
      now()
    )
    returning id into v_commission_id;
  else
    update public.transaction_commissions
      set organisation_id = coalesce(organisation_id, tx_row.organisation_id),
          assigned_agent_id = coalesce(assigned_agent_id, tx_row.assigned_agent_id, tx_row.assigned_user_id, tx_row.owner_user_id),
          assigned_agent_email = coalesce(assigned_agent_email, tx_row.assigned_agent_email),
          sale_price = coalesce(sale_price, v_sale_price),
          gross_commission_percentage = coalesce(gross_commission_percentage, v_gross_percentage),
          gross_commission_amount = coalesce(gross_commission_amount, v_gross_amount),
          agent_split_percentage_snapshot = coalesce(agent_split_percentage_snapshot, v_agent_split_percentage),
          agency_split_percentage_snapshot = coalesce(agency_split_percentage_snapshot, v_agency_split_percentage),
          agent_commission_amount = coalesce(agent_commission_amount, v_agent_amount),
          agency_commission_amount = coalesce(agency_commission_amount, v_agency_amount),
          commission_structure_id = coalesce(commission_structure_id, structure_row.id),
          commission_structure_version = coalesce(commission_structure_version, structure_row.version),
          commission_structure_name_snapshot = coalesce(commission_structure_name_snapshot, structure_row.name),
          status = coalesce(status, 'draft'),
          updated_at = now()
    where id = commission_row.id
    returning id into v_commission_id;
  end if;

  if structure_row.id is not null then
    v_applied := public.bridge_apply_commission_structure_to_transaction(
      tx_row.id,
      structure_row.id,
      p_actor_id
    );
  else
    v_applied := jsonb_build_object('success', false, 'code', 'structure_not_found');
  end if;

  for referral_row in
    select *
    from public.lead_referrals referral
    where referral.source_organisation_id = tx_row.organisation_id
      and referral.status in ('accepted', 'contacted', 'working', 'converted', 'commission_due', 'paid')
      and (
        referral.converted_transaction_id = tx_row.id
        or (
          referral.source_lead_id is not null
          and referral.source_lead_id in (tx_row.originating_lead_id, tx_row.originating_buyer_lead_id)
        )
        or (
          referral.referral_type = 'listing_collaboration'
          and referral.related_listing_id is not null
          and referral.related_listing_id = tx_row.listing_id
        )
      )
  loop
    v_referral_count := v_referral_count + 1;
    if referral_row.recipient_scope = 'internal' then
      v_internal_referral_count := v_internal_referral_count + 1;
    else
      v_external_referral_count := v_external_referral_count + 1;
    end if;

    v_link_type := case
      when referral_row.recipient_scope = 'internal' then 'internal_referral'
      when referral_row.referral_type = 'listing_collaboration' then 'listing_collaboration'
      when referral_row.referral_type = 'buyer_introduction' then 'buyer_introduction'
      when referral_row.recipient_scope in ('external_arch9', 'external_invite') then 'external_referral'
      else 'accepted_referral'
    end;

    v_referral_basis_amount := case referral_row.commission_split_basis
      when 'agent_commission' then v_agent_amount
      when 'agency_commission' then v_agency_amount
      when 'fixed_amount' then null
      else v_gross_amount
    end;
    v_referral_amount := coalesce(
      referral_row.referral_commission_amount,
      case
        when referral_row.commission_split_basis = 'fixed_amount' then referral_row.referral_commission_amount
        when v_referral_basis_amount is not null and referral_row.commission_split_percentage is not null
          then round((v_referral_basis_amount * referral_row.commission_split_percentage) / 100, 2)
        else null
      end
    );

    update public.lead_referrals
      set converted_transaction_id = coalesce(converted_transaction_id, tx_row.id),
          converted_at = coalesce(converted_at, now()),
          status = case
            when status in ('commission_due', 'paid') then status
            else 'converted'
          end,
          gross_commission_amount = coalesce(gross_commission_amount, v_gross_amount),
          referral_commission_amount = coalesce(referral_commission_amount, v_referral_amount),
          commission_status = case
            when commission_status in ('due', 'paid', 'waived', 'disputed') then commission_status
            when coalesce(v_referral_amount, referral_commission_amount, 0) > 0 then 'pending'
            else commission_status
          end,
          updated_at = now()
    where id = referral_row.id;

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
      tx_row.id,
      referral_row.id,
      tx_row.organisation_id,
      v_link_type,
      'active',
      true,
      p_actor_id,
      jsonb_build_object('source', 'phase_4_transaction_conversion_hook')
    )
    on conflict (transaction_id, referral_id)
      where status = 'active'
      do update set
        link_type = excluded.link_type,
        protection_period_applied = true,
        metadata = coalesce(public.transaction_referral_links.metadata, '{}'::jsonb) || excluded.metadata,
        updated_at = now();

    if referral_row.recipient_scope = 'internal' then
      referral_result := public.bridge_sync_internal_referral_accounting(
        referral_row.id,
        tx_row.id,
        v_gross_amount,
        null,
        p_actor_id
      );
    end if;
  end loop;

  return jsonb_build_object(
    'success', true,
    'code', 'conversion_commission_hook_applied',
    'transaction_id', tx_row.id,
    'transaction_commission_id', v_commission_id,
    'commission_structure_id', structure_row.id,
    'commission_structure_version', structure_row.version,
    'structure_apply_result', v_applied,
    'referral_count', v_referral_count,
    'internal_referral_count', v_internal_referral_count,
    'external_referral_count', v_external_referral_count
  );
end;
$$;

create or replace function public.bridge_apply_transaction_conversion_commission_after_transaction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.organisation_id is null then
    return new;
  end if;

  if new.accepted_offer_id is not null
     or new.originating_lead_id is not null
     or new.originating_buyer_lead_id is not null
     or new.gross_commission_amount is not null
     or new.gross_commission_percentage is not null then
    perform public.bridge_apply_transaction_conversion_commission_hook(new.id, auth.uid());
  end if;

  return new;
end;
$$;

drop trigger if exists trg_transactions_conversion_commission_hook on public.transactions;
create trigger trg_transactions_conversion_commission_hook
after insert or update of
  accepted_offer_id,
  originating_lead_id,
  originating_buyer_lead_id,
  listing_id,
  transaction_type,
  property_type,
  purchase_price,
  sales_price,
  assigned_agent_id,
  assigned_user_id,
  owner_user_id,
  assigned_agent_email,
  gross_commission_percentage,
  gross_commission_amount,
  agent_split_percentage_snapshot,
  agency_split_percentage_snapshot,
  agent_commission_amount,
  agency_commission_amount
on public.transactions
for each row
execute function public.bridge_apply_transaction_conversion_commission_after_transaction();

create or replace view public.transaction_conversion_commission_hook_v1 as
select
  tx.organisation_id,
  tx.id as transaction_id,
  tx.originating_lead_id,
  tx.originating_buyer_lead_id,
  tx.accepted_offer_id,
  tx.listing_id,
  commission.id as transaction_commission_id,
  commission.commission_structure_id,
  commission.commission_structure_version,
  commission.commission_structure_name_snapshot,
  commission.sale_price,
  commission.gross_commission_percentage,
  commission.gross_commission_amount,
  commission.agent_split_percentage_snapshot,
  commission.agency_split_percentage_snapshot,
  commission.agent_commission_amount,
  commission.agency_commission_amount,
  commission.status as commission_status,
  count(distinct link.referral_id) filter (where link.status = 'active') as linked_referral_count,
  count(distinct link.referral_id) filter (where link.status = 'active' and link.link_type = 'internal_referral') as linked_internal_referral_count,
  count(distinct link.referral_id) filter (where link.status = 'active' and link.link_type = 'external_referral') as linked_external_referral_count,
  commission.updated_at as commission_updated_at
from public.transactions tx
left join public.transaction_commissions commission
  on commission.transaction_id = tx.id
left join public.transaction_referral_links link
  on link.transaction_id = tx.id
group by
  tx.organisation_id,
  tx.id,
  tx.originating_lead_id,
  tx.originating_buyer_lead_id,
  tx.accepted_offer_id,
  tx.listing_id,
  commission.id,
  commission.commission_structure_id,
  commission.commission_structure_version,
  commission.commission_structure_name_snapshot,
  commission.sale_price,
  commission.gross_commission_percentage,
  commission.gross_commission_amount,
  commission.agent_split_percentage_snapshot,
  commission.agency_split_percentage_snapshot,
  commission.agent_commission_amount,
  commission.agency_commission_amount,
  commission.status,
  commission.updated_at;

grant execute on function public.bridge_apply_transaction_conversion_commission_hook(uuid, uuid) to authenticated;
grant execute on function public.bridge_apply_transaction_conversion_commission_after_transaction() to authenticated;
grant select on public.transaction_conversion_commission_hook_v1 to authenticated;

commit;
