-- Phase 8 commission reporting.
--
-- Reporting should read from the canonical allocation ledger and the review /
-- close-out models instead of rebuilding commission state in application code.
-- This phase adds finance-safe reporting views plus an audited snapshot RPC
-- for dashboard and export workflows.

begin;

create table if not exists public.commission_report_snapshots (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  report_type text not null default 'commission_finance_snapshot',
  filters jsonb not null default '{}'::jsonb,
  summary_json jsonb not null default '{}'::jsonb,
  row_count integer not null default 0,
  requested_by uuid references public.profiles(id) on delete set null,
  requested_by_email text,
  created_at timestamptz not null default now(),
  constraint commission_report_snapshots_type_check
    check (report_type in (
      'commission_finance_snapshot',
      'commission_export',
      'commission_closeout_snapshot'
    )),
  constraint commission_report_snapshots_row_count_check
    check (row_count >= 0)
);

create index if not exists commission_report_snapshots_org_created_idx
  on public.commission_report_snapshots (organisation_id, created_at desc);

create index if not exists transaction_commission_allocations_reporting_period_idx
  on public.transaction_commission_allocations (
    organisation_id,
    allocation_type,
    scope,
    status,
    created_at desc
  )
  where status <> 'cancelled';

create index if not exists transaction_commission_allocations_reporting_participant_idx
  on public.transaction_commission_allocations (
    organisation_id,
    participant_user_id,
    participant_email,
    status,
    created_at desc
  )
  where status <> 'cancelled';

create or replace view public.commission_allocation_reporting_base_v1 as
select
  allocation.id as allocation_id,
  allocation.organisation_id,
  org.name as organisation_name,
  allocation.transaction_id,
  tx.transaction_reference,
  tx.property_address_line_1,
  tx.purchase_price,
  tx.sales_price,
  tx.stage,
  tx.current_main_stage,
  tx.lifecycle_state,
  allocation.source_referral_id as referral_id,
  allocation.transaction_referral_link_id,
  allocation.commission_structure_id,
  structure.name as commission_structure_name,
  allocation.commission_structure_version,
  allocation.commission_structure_rule_id,
  allocation.allocation_type,
  allocation.scope,
  allocation.participant_role,
  allocation.participant_user_id,
  allocation.participant_organisation_id,
  participant_org.name as participant_organisation_name,
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
  coalesce(allocation.approved_amount, allocation.calculated_amount, allocation.fixed_amount, 0)::numeric(14,2) as report_amount,
  allocation.currency,
  allocation.status,
  allocation.requires_approval,
  allocation.approved_by,
  allocation.approved_at,
  allocation.due_at,
  allocation.paid_at,
  allocation.payment_reference,
  allocation.waived_at,
  allocation.waived_by,
  allocation.dispute_reason,
  allocation.override_reason,
  allocation.locked_at,
  referral.referral_type,
  referral.recipient_scope,
  referral.source_organisation_id,
  source_org.name as source_organisation_name,
  referral.target_organisation_id,
  target_org.name as target_organisation_name,
  referral.source_agent_id,
  referral.source_agent_name,
  referral.source_agent_email,
  referral.target_agent_id,
  referral.target_agent_name,
  referral.target_agent_email,
  referral.status as referral_status,
  referral.agreement_status,
  referral.commission_status as referral_commission_status,
  case
    when allocation.status = 'paid' then 'paid'
    when allocation.status = 'waived' then 'waived'
    when allocation.status = 'disputed' then 'disputed'
    when allocation.status = 'due' then 'payable_due'
    when allocation.status = 'approved' then 'approved_unpaid'
    when allocation.status = 'pending_approval'
      or (allocation.requires_approval = true and allocation.status = 'projected') then 'needs_review'
    else 'projected'
  end as reporting_bucket,
  case
    when allocation.status in ('paid', 'waived', 'cancelled') then 0
    else greatest(
      0,
      floor(extract(epoch from (now() - coalesce(allocation.due_at, allocation.approved_at, allocation.created_at))) / 86400)
    )::integer
  end as open_age_days,
  case
    when allocation.status in ('paid', 'waived', 'cancelled') then 'resolved'
    when coalesce(allocation.due_at, allocation.approved_at, allocation.created_at) >= now() - interval '7 days' then '0_7'
    when coalesce(allocation.due_at, allocation.approved_at, allocation.created_at) >= now() - interval '30 days' then '8_30'
    when coalesce(allocation.due_at, allocation.approved_at, allocation.created_at) >= now() - interval '60 days' then '31_60'
    when coalesce(allocation.due_at, allocation.approved_at, allocation.created_at) >= now() - interval '90 days' then '61_90'
    else '90_plus'
  end as aging_bucket,
  date_trunc('month', coalesce(allocation.paid_at, allocation.due_at, allocation.approved_at, allocation.created_at))::date as reporting_month,
  allocation.created_at,
  allocation.updated_at
from public.transaction_commission_allocations allocation
left join public.organisations org
  on org.id = allocation.organisation_id
left join public.transactions tx
  on tx.id = allocation.transaction_id
left join public.commission_structures structure
  on structure.id = allocation.commission_structure_id
left join public.organisations participant_org
  on participant_org.id = allocation.participant_organisation_id
left join public.lead_referrals referral
  on referral.id = allocation.source_referral_id
left join public.organisations source_org
  on source_org.id = referral.source_organisation_id
left join public.organisations target_org
  on target_org.id = referral.target_organisation_id
where allocation.status <> 'cancelled';

create or replace view public.commission_finance_summary_v1 as
select
  organisation_id,
  organisation_name,
  reporting_month,
  allocation_type,
  scope,
  status,
  reporting_bucket,
  currency,
  count(*)::integer as allocation_count,
  count(*) filter (where requires_approval = true)::integer as approval_required_count,
  count(*) filter (where status in ('projected', 'pending_approval'))::integer as pending_review_count,
  count(*) filter (where status = 'approved')::integer as approved_unpaid_count,
  count(*) filter (where status = 'due')::integer as due_count,
  count(*) filter (where status = 'disputed')::integer as disputed_count,
  count(*) filter (where status = 'paid')::integer as paid_count,
  count(*) filter (where status = 'waived')::integer as waived_count,
  coalesce(sum(calculated_amount), 0)::numeric(14,2) as calculated_total,
  coalesce(sum(approved_amount), 0)::numeric(14,2) as approved_total,
  coalesce(sum(report_amount), 0)::numeric(14,2) as report_total,
  coalesce(sum(report_amount) filter (where status not in ('paid', 'waived')), 0)::numeric(14,2) as open_total,
  coalesce(sum(report_amount) filter (where status = 'paid'), 0)::numeric(14,2) as paid_total
from public.commission_allocation_reporting_base_v1
group by
  organisation_id,
  organisation_name,
  reporting_month,
  allocation_type,
  scope,
  status,
  reporting_bucket,
  currency;

create or replace view public.commission_participant_earnings_v1 as
select
  organisation_id,
  organisation_name,
  participant_user_id,
  participant_email,
  participant_name,
  participant_role,
  participant_organisation_id,
  participant_organisation_name,
  reporting_month,
  currency,
  count(*)::integer as allocation_count,
  count(*) filter (where allocation_type = 'listing_commission')::integer as listing_allocation_count,
  count(*) filter (where allocation_type = 'selling_commission')::integer as selling_allocation_count,
  count(*) filter (where allocation_type in ('internal_referral', 'external_referral'))::integer as referral_allocation_count,
  coalesce(sum(report_amount), 0)::numeric(14,2) as total_amount,
  coalesce(sum(report_amount) filter (where status = 'paid'), 0)::numeric(14,2) as paid_amount,
  coalesce(sum(report_amount) filter (where status = 'due'), 0)::numeric(14,2) as due_amount,
  coalesce(sum(report_amount) filter (where status in ('approved', 'due')), 0)::numeric(14,2) as approved_unpaid_amount,
  coalesce(sum(report_amount) filter (where status = 'disputed'), 0)::numeric(14,2) as disputed_amount,
  max(updated_at) as latest_allocation_updated_at
from public.commission_allocation_reporting_base_v1
group by
  organisation_id,
  organisation_name,
  participant_user_id,
  participant_email,
  participant_name,
  participant_role,
  participant_organisation_id,
  participant_organisation_name,
  reporting_month,
  currency;

create or replace view public.commission_referral_reporting_v1 as
select
  organisation_id,
  organisation_name,
  transaction_id,
  transaction_reference,
  property_address_line_1,
  referral_id,
  allocation_id,
  allocation_type,
  scope,
  recipient_scope,
  referral_type,
  source_organisation_id,
  source_organisation_name,
  target_organisation_id,
  target_organisation_name,
  source_agent_id,
  source_agent_name,
  source_agent_email,
  target_agent_id,
  target_agent_name,
  target_agent_email,
  participant_user_id,
  participant_name,
  participant_email,
  participant_organisation_id,
  participant_organisation_name,
  percentage,
  fixed_amount,
  calculation_basis,
  allocation_pool,
  gross_commission_amount_snapshot,
  basis_amount_snapshot,
  calculated_amount,
  approved_amount,
  report_amount,
  currency,
  status,
  reporting_bucket,
  aging_bucket,
  open_age_days,
  due_at,
  paid_at,
  referral_status,
  agreement_status,
  referral_commission_status,
  reporting_month,
  created_at,
  updated_at
from public.commission_allocation_reporting_base_v1
where allocation_type in ('internal_referral', 'external_referral');

create or replace view public.commission_closeout_reporting_v1 as
select
  readiness.transaction_id,
  readiness.organisation_id,
  org.name as organisation_name,
  readiness.transaction_reference,
  readiness.property_address_line_1,
  readiness.purchase_price,
  readiness.sales_price,
  readiness.stage,
  readiness.current_main_stage,
  readiness.lifecycle_state,
  readiness.is_closeout_state,
  readiness.allocation_count,
  readiness.active_allocation_count,
  readiness.unresolved_allocation_count,
  readiness.pending_review_count,
  readiness.approved_unpaid_count,
  readiness.due_count,
  readiness.disputed_count,
  readiness.paid_count,
  readiness.waived_count,
  readiness.unresolved_amount,
  readiness.approved_unpaid_amount,
  readiness.closeout_ready,
  latest_event.action as latest_closeout_action,
  latest_event.reason as latest_closeout_reason,
  latest_event.actor_email as latest_closeout_actor_email,
  latest_event.created_at as latest_closeout_event_at,
  readiness.latest_allocation_updated_at
from public.transaction_commission_closeout_readiness_v1 readiness
left join public.organisations org
  on org.id = readiness.organisation_id
left join lateral (
  select event.*
  from public.commission_closeout_events event
  where event.transaction_id = readiness.transaction_id
  order by event.created_at desc
  limit 1
) latest_event on true;

create or replace function public.bridge_commission_reporting_snapshot(
  p_organisation_id uuid,
  p_from date default null,
  p_to date default null,
  p_report_type text default 'commission_finance_snapshot',
  p_include_detail boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from date := coalesce(p_from, (current_date - interval '12 months')::date);
  v_to date := coalesce(p_to, current_date);
  v_report_type text := coalesce(nullif(trim(p_report_type), ''), 'commission_finance_snapshot');
  v_actor_id uuid := auth.uid();
  v_actor_email text := public.bridge_current_email();
  v_summary jsonb;
  v_snapshot_id uuid;
  v_row_count integer := 0;
begin
  if p_organisation_id is null then
    return jsonb_build_object('success', false, 'code', 'organisation_id_required');
  end if;

  if v_to < v_from then
    return jsonb_build_object('success', false, 'code', 'invalid_date_range');
  end if;

  if v_report_type not in ('commission_finance_snapshot', 'commission_export', 'commission_closeout_snapshot') then
    return jsonb_build_object('success', false, 'code', 'invalid_report_type');
  end if;

  if not (
    public.bridge_is_org_admin(p_organisation_id)
    or public.bridge_is_active_member(p_organisation_id)
    or coalesce(auth.role(), '') = 'service_role'
  ) then
    return jsonb_build_object('success', false, 'code', 'forbidden');
  end if;

  select count(*)::integer
    into v_row_count
  from public.commission_allocation_reporting_base_v1 allocation
  where allocation.organisation_id = p_organisation_id
    and allocation.created_at::date between v_from and v_to;

  select jsonb_build_object(
    'version', 'commission_reporting_phase_8_v1',
    'organisation_id', p_organisation_id,
    'from', v_from,
    'to', v_to,
    'row_count', v_row_count,
    'status_totals', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'status', status,
          'allocation_count', allocation_count,
          'report_total', report_total,
          'open_total', open_total,
          'paid_total', paid_total
        )
        order by status
      )
      from (
        select
          status,
          count(*)::integer as allocation_count,
          coalesce(sum(report_amount), 0)::numeric(14,2) as report_total,
          coalesce(sum(report_amount) filter (where status not in ('paid', 'waived')), 0)::numeric(14,2) as open_total,
          coalesce(sum(report_amount) filter (where status = 'paid'), 0)::numeric(14,2) as paid_total
        from public.commission_allocation_reporting_base_v1
        where organisation_id = p_organisation_id
          and created_at::date between v_from and v_to
        group by status
      ) status_report
    ), '[]'::jsonb),
    'allocation_type_totals', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'allocation_type', allocation_type,
          'scope', scope,
          'allocation_count', allocation_count,
          'report_total', report_total
        )
        order by allocation_type, scope
      )
      from (
        select
          allocation_type,
          scope,
          count(*)::integer as allocation_count,
          coalesce(sum(report_amount), 0)::numeric(14,2) as report_total
        from public.commission_allocation_reporting_base_v1
        where organisation_id = p_organisation_id
          and created_at::date between v_from and v_to
        group by allocation_type, scope
      ) type_report
    ), '[]'::jsonb),
    'aging_totals', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'aging_bucket', aging_bucket,
          'allocation_count', allocation_count,
          'open_total', open_total
        )
        order by aging_bucket
      )
      from (
        select
          aging_bucket,
          count(*)::integer as allocation_count,
          coalesce(sum(report_amount) filter (where status not in ('paid', 'waived')), 0)::numeric(14,2) as open_total
        from public.commission_allocation_reporting_base_v1
        where organisation_id = p_organisation_id
          and created_at::date between v_from and v_to
        group by aging_bucket
      ) aging_report
    ), '[]'::jsonb),
    'closeout', coalesce((
      select jsonb_build_object(
        'transaction_count', count(*)::integer,
        'ready_count', count(*) filter (where closeout_ready = true)::integer,
        'blocked_count', count(*) filter (where closeout_ready = false and active_allocation_count > 0)::integer,
        'missing_allocation_count', count(*) filter (where active_allocation_count = 0)::integer,
        'unresolved_amount', coalesce(sum(unresolved_amount), 0)::numeric(14,2)
      )
      from public.commission_closeout_reporting_v1 closeout
      where closeout.organisation_id = p_organisation_id
    ), '{}'::jsonb),
    'detail', case when p_include_detail then coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'allocation_id', allocation_id,
          'transaction_id', transaction_id,
          'transaction_reference', transaction_reference,
          'allocation_type', allocation_type,
          'scope', scope,
          'participant_name', participant_name,
          'participant_email', participant_email,
          'status', status,
          'report_amount', report_amount,
          'currency', currency,
          'reporting_bucket', reporting_bucket,
          'aging_bucket', aging_bucket,
          'created_at', created_at
        )
        order by created_at desc
      )
      from (
        select *
        from public.commission_allocation_reporting_base_v1
        where organisation_id = p_organisation_id
          and created_at::date between v_from and v_to
        order by created_at desc
        limit 250
      ) detail_report
    ), '[]'::jsonb) else '[]'::jsonb end
  )
  into v_summary;

  insert into public.commission_report_snapshots (
    organisation_id,
    report_type,
    filters,
    summary_json,
    row_count,
    requested_by,
    requested_by_email
  )
  values (
    p_organisation_id,
    v_report_type,
    jsonb_build_object('from', v_from, 'to', v_to, 'include_detail', p_include_detail),
    v_summary,
    v_row_count,
    v_actor_id,
    v_actor_email
  )
  returning id into v_snapshot_id;

  return jsonb_build_object(
    'success', true,
    'code', 'commission_reporting_snapshot_created',
    'snapshot_id', v_snapshot_id,
    'report_type', v_report_type,
    'summary', v_summary
  );
end;
$$;

alter table public.commission_report_snapshots enable row level security;

drop policy if exists commission_report_snapshots_member_select on public.commission_report_snapshots;
create policy commission_report_snapshots_member_select on public.commission_report_snapshots
for select to authenticated
using (public.bridge_is_active_member(organisation_id));

drop policy if exists commission_report_snapshots_member_insert on public.commission_report_snapshots;
create policy commission_report_snapshots_member_insert on public.commission_report_snapshots
for insert to authenticated
with check (public.bridge_is_active_member(organisation_id));

grant select, insert on table public.commission_report_snapshots to authenticated;
grant select on public.commission_allocation_reporting_base_v1 to authenticated;
grant select on public.commission_finance_summary_v1 to authenticated;
grant select on public.commission_participant_earnings_v1 to authenticated;
grant select on public.commission_referral_reporting_v1 to authenticated;
grant select on public.commission_closeout_reporting_v1 to authenticated;
grant execute on function public.bridge_commission_reporting_snapshot(uuid, date, date, text, boolean) to authenticated;

commit;
