begin;

create index if not exists attorney_lead_conversions_firm_transaction_completed_idx
  on public.attorney_lead_conversions (attorney_firm_id, transaction_id, organisation_id, lead_id)
  where conversion_status = 'completed' and transaction_id is not null;

create or replace function public.get_attorney_dashboard_partner_revenue_snapshot(
  p_firm_id uuid,
  p_role_view text default 'all'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_role text;
  v_firm_organisation_id uuid;
  v_role_view text := lower(trim(coalesce(p_role_view, 'all')));
  v_result jsonb;
begin
  if p_firm_id is null or v_actor_id is null then
    raise exception 'Attorney dashboard access requires an authenticated firm member.'
      using errcode = '42501';
  end if;

  select member.role
    into v_role
  from public.attorney_firm_members member
  where member.firm_id = p_firm_id
    and member.user_id = v_actor_id
    and member.status = 'active'
  limit 1;

  if v_role not in ('firm_admin', 'director_partner') then
    raise exception 'You do not have permission to view this attorney firm dashboard.'
      using errcode = '42501';
  end if;

  select firm.organisation_id
    into v_firm_organisation_id
  from public.attorney_firms firm
  where firm.id = p_firm_id;

  with assignment_rows as (
    select
      assignment.transaction_id,
      coalesce(
        assignment.attorney_role,
        case lower(coalesce(assignment.assignment_type, ''))
          when 'bond' then 'bond_attorney'
          when 'cancellation' then 'cancellation_attorney'
          else 'transfer_attorney'
        end
      ) as attorney_role,
      coalesce(assignment.instruction_accepted_at, assignment.firm_accepted_at, assignment.assigned_at) as accepted_at
    from public.transaction_attorney_assignments assignment
    where coalesce(assignment.attorney_firm_id, assignment.firm_id) = p_firm_id
      and coalesce(assignment.assignment_status, assignment.status, 'active') in ('pending', 'active', 'paused')
  ),
  matter_roles as (
    select
      assignment.transaction_id,
      array_agg(distinct assignment.attorney_role order by assignment.attorney_role) as roles,
      min(assignment.accepted_at) as assignment_accepted_at
    from assignment_rows assignment
    group by assignment.transaction_id
  ),
  matters as (
    select
      transaction.id as transaction_id,
      roles.roles,
      coalesce(transaction.originating_partner_organisation_id, transaction.referral_source_organisation_id) as partner_id,
      coalesce(
        roles.assignment_accepted_at,
        transaction.instructed_at,
        transaction.instruction_at,
        transaction.instruction_date::timestamptz
      ) as accepted_at
    from matter_roles roles
    join public.transactions transaction on transaction.id = roles.transaction_id
    where transaction.is_active = true
      and lower(coalesce(transaction.lifecycle_state, 'active')) not in ('archived', 'cancelled', 'deleted')
      and lower(coalesce(transaction.stage, '')) <> 'available'
      and lower(coalesce(transaction.current_main_stage, '')) not in ('avail', 'available')
      and lower(coalesce(transaction.next_action, '')) not like 'transaction deleted%'
      and lower(coalesce(transaction.next_action, '')) not like 'transaction reset to available%'
      and case v_role_view
        when 'transfer' then 'transfer_attorney' = any(roles.roles)
        when 'bond' then 'bond_attorney' = any(roles.roles)
        when 'cancellation' then 'cancellation_attorney' = any(roles.roles)
        when 'shared' then cardinality(roles.roles) > 1
        when 'full-service' then cardinality(roles.roles) = 3
        else true
      end
  ),
  professional_entry_fees as (
    select
      entry.transaction_id,
      sum(entry.amount) as professional_fee
    from public.matter_financial_entries entry
    join matters matter on matter.transaction_id = entry.transaction_id
    where entry.entry_status = 'posted'
      and entry.entry_type in ('charge', 'debit', 'opening_balance', 'adjustment')
      and entry.amount > 0
      and lower(coalesce(
        entry.metadata_json->>'revenueCategory',
        entry.metadata_json->>'revenue_category',
        entry.metadata_json->>'feeCategory',
        entry.metadata_json->>'fee_category',
        entry.metadata_json->>'componentType',
        entry.metadata_json->>'component_type',
        ''
      )) in ('professional_fee', 'professional-fee', 'attorney_professional_fee', 'legal_professional_fee')
    group by entry.transaction_id
  ),
  accepted_quote_fees as (
    select
      conversion.transaction_id,
      max(quote.professional_fee) as professional_fee
    from public.attorney_lead_conversions conversion
    join public.attorney_lead_quotes quote
      on quote.organisation_id = conversion.organisation_id
      and quote.lead_id = conversion.lead_id
      and quote.status = 'accepted'
    join matters matter on matter.transaction_id = conversion.transaction_id
    where conversion.attorney_firm_id = p_firm_id
      and conversion.conversion_status = 'completed'
      and conversion.transaction_id is not null
      and quote.professional_fee > 0
    group by conversion.transaction_id
  ),
  matter_revenue as (
    select
      matter.transaction_id,
      matter.partner_id,
      matter.accepted_at,
      case
        when entry_fee.professional_fee > 0 then entry_fee.professional_fee
        when quote_fee.professional_fee > 0 then quote_fee.professional_fee
        else null
      end as professional_fee,
      case
        when entry_fee.professional_fee > 0 then 'posted_professional_fee'
        when quote_fee.professional_fee > 0 then 'accepted_structured_quote'
        else null
      end as revenue_source
    from matters matter
    left join professional_entry_fees entry_fee on entry_fee.transaction_id = matter.transaction_id
    left join accepted_quote_fees quote_fee on quote_fee.transaction_id = matter.transaction_id
  ),
  partner_rows as (
    select
      organisation.id as partner_id,
      coalesce(nullif(trim(organisation.display_name), ''), nullif(trim(organisation.name), ''), 'Partner') as partner_name,
      coalesce(nullif(trim(organisation.type), ''), 'partner') as partner_type,
      organisation.logo_url,
      count(*) as active_matters,
      count(*) filter (
        where timezone('Africa/Johannesburg', revenue.accepted_at) >=
          date_trunc('month', timezone('Africa/Johannesburg', now()))
      ) as new_this_month,
      coalesce(sum(revenue.professional_fee), 0) as revenue_pipeline,
      count(*) filter (where revenue.professional_fee is not null) as priced_matters,
      jsonb_agg(revenue.transaction_id order by revenue.transaction_id) as matter_ids
    from matter_revenue revenue
    join public.organisations organisation on organisation.id = revenue.partner_id
    where revenue.partner_id is not null
      and revenue.partner_id is distinct from v_firm_organisation_id
    group by organisation.id, organisation.display_name, organisation.name, organisation.type, organisation.logo_url
  )
  select jsonb_build_object(
    'sourceStatus', 'available',
    'roleView', v_role_view,
    'revenuePipeline', jsonb_build_object(
      'amount', coalesce((select sum(professional_fee) from matter_revenue), 0),
      'pricedMatterCount', (select count(*) from matter_revenue where professional_fee is not null),
      'unpricedMatterCount', (select count(*) from matter_revenue where professional_fee is null),
      'activeMatterCount', (select count(*) from matter_revenue),
      'matterIds', coalesce(
        (select jsonb_agg(transaction_id order by transaction_id) from matter_revenue where professional_fee is not null),
        '[]'::jsonb
      ),
      'postedEntryMatterCount', (select count(*) from matter_revenue where revenue_source = 'posted_professional_fee'),
      'acceptedQuoteMatterCount', (select count(*) from matter_revenue where revenue_source = 'accepted_structured_quote')
    ),
    'partners', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'partnerId', partner_id,
            'partnerName', partner_name,
            'partnerType', partner_type,
            'logoUrl', logo_url,
            'activeMatters', active_matters,
            'newThisMonth', new_this_month,
            'revenuePipeline', revenue_pipeline,
            'pricedMatterCount', priced_matters,
            'matterIds', matter_ids
          )
          order by revenue_pipeline desc, active_matters desc, partner_name
        )
        from partner_rows
      ),
      '[]'::jsonb
    )
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.get_attorney_dashboard_partner_revenue_snapshot(uuid, text) from public, anon;
grant execute on function public.get_attorney_dashboard_partner_revenue_snapshot(uuid, text) to authenticated;

comment on function public.get_attorney_dashboard_partner_revenue_snapshot(uuid, text) is
  'Returns firm-wide professional-fee revenue coverage and stable-ID partner analytics for the attorney dashboard.';

create or replace function public.bridge_emit_attorney_partner_revenue_refresh_signal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_transaction_id uuid;
  target_organisation_id uuid;
  target_lead_id uuid;
begin
  if tg_table_name = 'transactions' then
    target_transaction_id := case when tg_op = 'DELETE' then old.id else new.id end;
  elsif tg_table_name = 'transaction_attorney_assignments' then
    target_transaction_id := case when tg_op = 'DELETE' then old.transaction_id else new.transaction_id end;
  elsif tg_table_name = 'attorney_lead_conversions' then
    target_transaction_id := case when tg_op = 'DELETE' then old.transaction_id else new.transaction_id end;
  elsif tg_table_name = 'attorney_lead_quotes' then
    target_organisation_id := case when tg_op = 'DELETE' then old.organisation_id else new.organisation_id end;
    target_lead_id := case when tg_op = 'DELETE' then old.lead_id else new.lead_id end;
    select conversion.transaction_id
      into target_transaction_id
    from public.attorney_lead_conversions conversion
    where conversion.organisation_id = target_organisation_id
      and conversion.lead_id = target_lead_id
      and conversion.conversion_status = 'completed'
    limit 1;
  end if;

  if target_transaction_id is not null then
    insert into public.transaction_refresh_signals (
      transaction_id, version, command_receipt_id, canonical_event_id, changed_at
    ) values (
      target_transaction_id, 1, null, null, now()
    )
    on conflict (transaction_id) do update set
      version = public.transaction_refresh_signals.version + 1,
      command_receipt_id = null,
      canonical_event_id = null,
      changed_at = excluded.changed_at;
  end if;

  return null;
end;
$$;

revoke all on function public.bridge_emit_attorney_partner_revenue_refresh_signal() from public;

drop trigger if exists bridge_attorney_partner_revenue_transaction_refresh on public.transactions;
create trigger bridge_attorney_partner_revenue_transaction_refresh
  after update of originating_partner_organisation_id, referral_source_organisation_id,
    instructed_at, instruction_at, instruction_date
  on public.transactions for each row
  execute function public.bridge_emit_attorney_partner_revenue_refresh_signal();

drop trigger if exists bridge_attorney_partner_revenue_assignment_refresh on public.transaction_attorney_assignments;
create trigger bridge_attorney_partner_revenue_assignment_refresh
  after insert or update of instruction_accepted_at, firm_accepted_at, assigned_at or delete
  on public.transaction_attorney_assignments for each row
  execute function public.bridge_emit_attorney_partner_revenue_refresh_signal();

drop trigger if exists bridge_attorney_partner_revenue_conversion_refresh on public.attorney_lead_conversions;
create trigger bridge_attorney_partner_revenue_conversion_refresh
  after insert or update of transaction_id, conversion_status or delete
  on public.attorney_lead_conversions for each row
  execute function public.bridge_emit_attorney_partner_revenue_refresh_signal();

drop trigger if exists bridge_attorney_partner_revenue_quote_refresh on public.attorney_lead_quotes;
create trigger bridge_attorney_partner_revenue_quote_refresh
  after insert or update of status, professional_fee or delete
  on public.attorney_lead_quotes for each row
  execute function public.bridge_emit_attorney_partner_revenue_refresh_signal();

commit;
