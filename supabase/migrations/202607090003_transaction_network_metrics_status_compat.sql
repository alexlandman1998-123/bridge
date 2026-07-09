begin;

create or replace function public.bridge_phase7_refresh_network_metrics(p_organization_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_metrics_count integer := 0;
  v_opportunities_count integer := 0;
begin
  if p_organization_id is null and not public.bridge_phase7_is_bridge_admin() then
    return jsonb_build_object('success', false, 'code', 'not_authorized');
  end if;

  if p_organization_id is not null and not public.bridge_phase7_is_org_member(p_organization_id) then
    return jsonb_build_object('success', false, 'code', 'not_authorized');
  end if;

  insert into public.network_referral_events (
    transaction_id,
    source_organization_id,
    target_organization_id,
    relationship_type,
    role_type,
    partner_prospect_id,
    referral_source_organization_id,
    transaction_value,
    occurred_at,
    metadata
  )
  select
    tx.id,
    tx.organisation_id,
    target.target_organization_id,
    public.bridge_phase4_relationship_type(tx.organisation_id, target.target_organization_id),
    coalesce(nullif(trim(trp.role_type), ''), 'other'),
    trp.partner_prospect_id,
    tx.referral_source_organisation_id,
    coalesce(tx.purchase_price, tx.sales_price, tx.bond_amount, tx.cash_amount, 0),
    coalesce(tx.created_at, now()),
    jsonb_build_object('source', 'transaction_role_players', 'roleplayerId', trp.id)
  from public.transactions tx
  join public.transaction_role_players trp on trp.transaction_id = tx.id
  cross join lateral (
    select coalesce(trp.partner_organisation_id, trp.assigned_organisation_id, trp.organisation_id) as target_organization_id
  ) target
  where tx.organisation_id is not null
    and target.target_organization_id is not null
    and tx.organisation_id <> target.target_organization_id
    and (p_organization_id is null or p_organization_id in (tx.organisation_id, target.target_organization_id))
  on conflict do nothing;

  insert into public.network_referral_events (
    transaction_id,
    source_organization_id,
    target_organization_id,
    relationship_type,
    role_type,
    referral_source_organization_id,
    transaction_value,
    occurred_at,
    metadata
  )
  select
    tx.id,
    tx.referral_source_organisation_id,
    tx.organisation_id,
    public.bridge_phase4_relationship_type(tx.referral_source_organisation_id, tx.organisation_id),
    'referral_source',
    tx.referral_source_organisation_id,
    coalesce(tx.purchase_price, tx.sales_price, tx.bond_amount, tx.cash_amount, 0),
    coalesce(tx.created_at, now()),
    jsonb_build_object('source', 'transaction_referral_source')
  from public.transactions tx
  where tx.referral_source_organisation_id is not null
    and tx.organisation_id is not null
    and tx.referral_source_organisation_id <> tx.organisation_id
    and (p_organization_id is null or p_organization_id in (tx.referral_source_organisation_id, tx.organisation_id))
  on conflict do nothing;

  delete from public.organization_relationship_metrics
  where p_organization_id is null
     or source_organization_id = p_organization_id
     or target_organization_id = p_organization_id;

  insert into public.organization_relationship_metrics (
    source_organization_id,
    target_organization_id,
    relationship_type,
    transaction_count,
    active_transaction_count,
    completed_transaction_count,
    completion_rate,
    average_cycle_time,
    average_response_time,
    referral_volume,
    relationship_health_score,
    first_transaction_date,
    last_transaction_date
  )
  select
    aggregates.source_organization_id,
    aggregates.target_organization_id,
    aggregates.relationship_type,
    aggregates.transaction_count,
    aggregates.active_transaction_count,
    aggregates.completed_transaction_count,
    aggregates.completion_rate,
    aggregates.average_cycle_time,
    aggregates.average_response_time,
    aggregates.referral_volume,
    public.bridge_phase7_relationship_health_score(
      aggregates.transaction_count,
      aggregates.active_transaction_count,
      aggregates.completed_transaction_count,
      aggregates.average_cycle_time,
      aggregates.average_response_time,
      aggregates.last_transaction_date
    ),
    aggregates.first_transaction_date,
    aggregates.last_transaction_date
  from (
    select
      nre.source_organization_id,
      nre.target_organization_id,
      nre.relationship_type,
      count(distinct nre.transaction_id)::integer as transaction_count,
      count(distinct nre.transaction_id) filter (
        where lower(coalesce(tx.stage, tx.current_main_stage, '')) not in ('reg', 'registered', 'completed', 'complete', 'cancelled', 'archived')
          and tx.completed_at is null
      )::integer as active_transaction_count,
      count(distinct nre.transaction_id) filter (
        where lower(coalesce(tx.stage, tx.current_main_stage, '')) in ('reg', 'registered', 'completed', 'complete')
          or tx.completed_at is not null
          or tx.registered_at is not null
      )::integer as completed_transaction_count,
      round(
        count(distinct nre.transaction_id) filter (
          where lower(coalesce(tx.stage, tx.current_main_stage, '')) in ('reg', 'registered', 'completed', 'complete')
            or tx.completed_at is not null
            or tx.registered_at is not null
        )::numeric / greatest(count(distinct nre.transaction_id), 1),
        4
      ) as completion_rate,
      round((avg(extract(epoch from (coalesce(tx.completed_at, tx.registered_at) - tx.created_at)) / 86400) filter (
        where coalesce(tx.completed_at, tx.registered_at) is not null
      ))::numeric, 2) as average_cycle_time,
      round((avg(extract(epoch from (assignment.first_assignment_at - tx.created_at)) / 3600) filter (
        where assignment.first_assignment_at is not null
      ))::numeric, 2) as average_response_time,
      coalesce(sum(nre.transaction_value), 0)::numeric(14, 2) as referral_volume,
      min(tx.created_at) as first_transaction_date,
      max(coalesce(tx.completed_at, tx.registered_at, tx.updated_at, tx.created_at)) as last_transaction_date
    from public.network_referral_events nre
    join public.transactions tx on tx.id = nre.transaction_id
    left join lateral (
      select min(ae.created_at) as first_assignment_at
      from public.assignment_events ae
      where ae.transaction_id = tx.id
        and ae.event_type in ('assigned', 'reassigned')
    ) assignment on true
    where p_organization_id is null
       or p_organization_id in (nre.source_organization_id, nre.target_organization_id)
    group by nre.source_organization_id, nre.target_organization_id, nre.relationship_type
  ) aggregates
  on conflict (source_organization_id, target_organization_id, relationship_type) do update
  set transaction_count = excluded.transaction_count,
      active_transaction_count = excluded.active_transaction_count,
      completed_transaction_count = excluded.completed_transaction_count,
      completion_rate = excluded.completion_rate,
      average_cycle_time = excluded.average_cycle_time,
      average_response_time = excluded.average_response_time,
      referral_volume = excluded.referral_volume,
      relationship_health_score = excluded.relationship_health_score,
      first_transaction_date = excluded.first_transaction_date,
      last_transaction_date = excluded.last_transaction_date,
      updated_at = now();

  get diagnostics v_metrics_count = row_count;

  delete from public.network_partner_opportunities
  where true;

  insert into public.network_partner_opportunities (
    partner_prospect_id,
    role_type,
    company_name,
    company_key,
    status,
    transactions_waiting,
    agencies_count,
    invitation_count,
    accepted_invitation_count,
    conversion_rate,
    opportunity_score,
    last_selected_at,
    metadata
  )
  select
    pp.id,
    pp.role_type,
    pp.company_name,
    pp.company_key,
    case when pp.status in ('joined', 'connected') then 'converted' else 'pending' end,
    greatest(coalesce(pp.transaction_count, 0) - coalesce(pp.accepted_invitation_count, 0), 0),
    coalesce(usage.agencies_count, 0),
    coalesce(pp.invitation_count, 0),
    coalesce(pp.accepted_invitation_count, 0),
    round(coalesce(pp.accepted_invitation_count, 0)::numeric / greatest(coalesce(pp.invitation_count, 0), 1), 4),
    greatest(0, least(100, (
      greatest(coalesce(pp.transaction_count, 0) - coalesce(pp.accepted_invitation_count, 0), 0) * 8
      + coalesce(pp.invitation_count, 0) * 4
      + coalesce(usage.agencies_count, 0) * 6
    )))::integer,
    pp.last_transaction_date,
    jsonb_build_object(
      'contactName', pp.contact_name,
      'email', pp.email,
      'phone', pp.phone,
      'prospectStatus', pp.status
    )
  from public.partner_prospects pp
  left join lateral (
    select count(distinct nre.source_organization_id)::integer as agencies_count
    from public.network_referral_events nre
    where nre.partner_prospect_id = pp.id
  ) usage on true
  where coalesce(pp.status, 'invited') not in ('connected')
    and (coalesce(pp.transaction_count, 0) > 0 or coalesce(pp.invitation_count, 0) > 0);

  get diagnostics v_opportunities_count = row_count;

  return jsonb_build_object(
    'success', true,
    'metricsUpdated', v_metrics_count,
    'opportunitiesUpdated', v_opportunities_count
  );
end;
$$;

commit;
