begin;

-- Older SECURITY DEFINER snapshots compare a nullable role with NOT IN.
-- A missing membership makes that predicate NULL, not TRUE. Rename their
-- implementations and replace the existing API names atomically, so older
-- deployed clients continue to use the now-guarded functions.
alter function public.get_attorney_dashboard_snapshot(uuid, text, integer)
  rename to get_attorney_dashboard_snapshot_unchecked;
alter function public.get_attorney_dashboard_attention_snapshot(uuid, text)
  rename to get_attorney_dashboard_attention_snapshot_unchecked;
alter function public.get_attorney_dashboard_partner_revenue_snapshot(uuid, text)
  rename to get_attorney_dashboard_partner_revenue_snapshot_unchecked;
alter function public.get_attorney_dashboard_health_performance_snapshot(uuid, text, date, date)
  rename to get_attorney_dashboard_health_performance_snapshot_unchecked;

create or replace function public.bridge_assert_attorney_dashboard_lead(p_firm_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_firm_id is null or auth.uid() is null or not exists (
    select 1 from public.attorney_firm_members member
    where member.firm_id = p_firm_id
      and member.user_id = auth.uid()
      and member.status = 'active'
      and member.role in ('firm_admin', 'director_partner')
  ) then
    raise exception 'You do not have permission to view this attorney firm dashboard.' using errcode = '42501';
  end if;
end;
$$;

create function public.get_attorney_dashboard_snapshot(
  p_firm_id uuid, p_role_view text default 'all', p_detail_limit integer default 100
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.bridge_assert_attorney_dashboard_lead(p_firm_id);
  return public.get_attorney_dashboard_snapshot_unchecked(p_firm_id, p_role_view, p_detail_limit);
end;
$$;

create function public.get_attorney_dashboard_attention_snapshot(
  p_firm_id uuid, p_role_view text default 'all'
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.bridge_assert_attorney_dashboard_lead(p_firm_id);
  return public.get_attorney_dashboard_attention_snapshot_unchecked(p_firm_id, p_role_view);
end;
$$;

create function public.get_attorney_dashboard_partner_revenue_snapshot(
  p_firm_id uuid, p_role_view text default 'all'
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.bridge_assert_attorney_dashboard_lead(p_firm_id);
  return public.get_attorney_dashboard_partner_revenue_snapshot_unchecked(p_firm_id, p_role_view);
end;
$$;

create function public.get_attorney_dashboard_health_performance_snapshot(
  p_firm_id uuid, p_role_view text default 'all', p_period_start date default null, p_period_end date default null
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.bridge_assert_attorney_dashboard_lead(p_firm_id);
  return public.get_attorney_dashboard_health_performance_snapshot_unchecked(p_firm_id, p_role_view, p_period_start, p_period_end);
end;
$$;

revoke all on function public.bridge_assert_attorney_dashboard_lead(uuid) from public, anon, authenticated;
revoke all on function public.get_attorney_dashboard_snapshot_unchecked(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.get_attorney_dashboard_attention_snapshot_unchecked(uuid, text) from public, anon, authenticated;
revoke all on function public.get_attorney_dashboard_partner_revenue_snapshot_unchecked(uuid, text) from public, anon, authenticated;
revoke all on function public.get_attorney_dashboard_health_performance_snapshot_unchecked(uuid, text, date, date) from public, anon, authenticated;
revoke all on function public.get_attorney_dashboard_snapshot(uuid, text, integer) from public, anon;
revoke all on function public.get_attorney_dashboard_attention_snapshot(uuid, text) from public, anon;
revoke all on function public.get_attorney_dashboard_partner_revenue_snapshot(uuid, text) from public, anon;
revoke all on function public.get_attorney_dashboard_health_performance_snapshot(uuid, text, date, date) from public, anon;
grant execute on function public.get_attorney_dashboard_snapshot(uuid, text, integer) to authenticated;
grant execute on function public.get_attorney_dashboard_attention_snapshot(uuid, text) to authenticated;
grant execute on function public.get_attorney_dashboard_partner_revenue_snapshot(uuid, text) to authenticated;
grant execute on function public.get_attorney_dashboard_health_performance_snapshot(uuid, text, date, date) to authenticated;

-- Drill-down populations are taken from the same authoritative snapshot as
-- the dashboard card. Only the requested page crosses the API boundary.
create or replace function public.get_attorney_dashboard_metric_matter_page(
  p_firm_id uuid,
  p_metric_group text,
  p_metric_key text,
  p_role_view text default 'all',
  p_page integer default 1,
  p_page_size integer default 20,
  p_search text default ''
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_group text := lower(trim(coalesce(p_metric_group, '')));
  v_key text := lower(trim(coalesce(p_metric_key, '')));
  v_page integer := greatest(1, coalesce(p_page, 1));
  v_page_size integer := least(100, greatest(1, coalesce(p_page_size, 20)));
  v_snapshot jsonb;
  v_ids jsonb;
  v_rows jsonb;
  v_total integer;
begin
  -- Each snapshot performs its own active firm-admin/director authorization.
  -- No caller-supplied matter IDs are accepted by this function.
  if v_group = 'attention' and v_key in
    ('signatures', 'guarantees', 'clearance', 'clientdocuments', 'invoices', 'stalled') then
    v_snapshot := public.get_attorney_dashboard_attention_snapshot(p_firm_id, p_role_view);
    v_ids := v_snapshot -> (case when v_key = 'clientdocuments' then 'clientDocuments' else v_key end) -> 'matterIds';
  elsif v_group = 'revenue' and v_key = 'revenue_pipeline' then
    v_snapshot := public.get_attorney_dashboard_partner_revenue_snapshot(p_firm_id, p_role_view);
    v_ids := v_snapshot #> '{revenuePipeline,matterIds}';
  elsif v_group = 'health' and v_key in ('on_track', 'attention', 'critical') then
    v_snapshot := public.get_attorney_dashboard_health_performance_snapshot(p_firm_id, p_role_view, null, null);
    v_ids := v_snapshot -> 'matterHealth' -> (case when v_key = 'on_track' then 'onTrack' else v_key end) -> 'matterIds';
  elsif v_group = 'performance' and v_key in
    ('registered_in_period', 'terminal_outcome_in_period', 'documents_approved_in_period',
     'forecast_this_week', 'forecast_next_week', 'forecast_this_month',
     'primary_transfer', 'primary_bond', 'primary_cancellation') then
    v_snapshot := public.get_attorney_dashboard_health_performance_snapshot(p_firm_id, p_role_view, null, null);
    v_ids := case v_key
      when 'registered_in_period' then v_snapshot #> '{conveyancingPerformance,registrationMatterIds}'
      when 'terminal_outcome_in_period' then v_snapshot #> '{conveyancingPerformance,registrationOutcomeMatterIds}'
      when 'documents_approved_in_period' then v_snapshot #> '{conveyancingPerformance,documentTurnaroundMatterIds}'
      when 'forecast_this_week' then v_snapshot #> '{conveyancingPerformance,registrationForecast,thisWeekMatterIds}'
      when 'forecast_next_week' then v_snapshot #> '{conveyancingPerformance,registrationForecast,nextWeekMatterIds}'
      when 'forecast_this_month' then v_snapshot #> '{conveyancingPerformance,registrationForecast,thisMonthMatterIds}'
      else (
        select item -> 'matterIds'
        from jsonb_array_elements(v_snapshot #> '{conveyancingPerformance,matterDistribution}') item
        where lower(item ->> 'label') = substring(v_key from 9)
        limit 1
      )
    end;
  else
    raise exception 'Unknown attorney dashboard metric.' using errcode = '22023';
  end if;

  if v_snapshot ->> 'sourceStatus' <> 'available' or jsonb_typeof(v_ids) is distinct from 'array' then
    raise exception 'Attorney dashboard metric source is unavailable.' using errcode = '55000';
  end if;

  with metric_ids as (
    select distinct value::uuid as transaction_id
    from jsonb_array_elements_text(v_ids)
  ),
  matching as (
    select
      transaction.id,
      transaction.matter_number,
      transaction.transaction_reference,
      transaction.stage,
      transaction.current_main_stage,
      transaction.current_sub_stage_summary,
      transaction.attorney_stage,
      transaction.next_action,
      transaction.next_action_due_at,
      transaction.target_registration_date,
      transaction.risk_status,
      transaction.operational_state,
      transaction.lifecycle_state,
      transaction.registration_date,
      transaction.updated_at,
      transaction.property_description,
      transaction.property_address_line_1,
      transaction.suburb,
      transaction.city,
      coalesce(transaction.sales_price, transaction.purchase_price) as value,
      buyer.name as buyer_name,
      assignment.id as assignment_id,
      assignment.attorney_role,
      assignment.assignment_type
    from metric_ids metric
    join public.transactions transaction on transaction.id = metric.transaction_id
    join lateral (
      select candidate.id, candidate.attorney_role, candidate.assignment_type
      from public.transaction_attorney_assignments candidate
      where candidate.transaction_id = transaction.id
        and coalesce(candidate.attorney_firm_id, candidate.firm_id) = p_firm_id
        and coalesce(candidate.assignment_status, candidate.status, 'active') <> 'removed'
      order by candidate.is_primary desc nulls last, candidate.assigned_at desc nulls last, candidate.id
      limit 1
    ) assignment on true
    left join public.buyers buyer on buyer.id = transaction.buyer_id
    where nullif(trim(coalesce(p_search, '')), '') is null
      or transaction.matter_number ilike '%' || trim(p_search) || '%'
      or transaction.transaction_reference ilike '%' || trim(p_search) || '%'
      or transaction.property_description ilike '%' || trim(p_search) || '%'
      or transaction.property_address_line_1 ilike '%' || trim(p_search) || '%'
      or buyer.name ilike '%' || trim(p_search) || '%'
  ),
  counted as (
    select count(*)::integer as total from matching
  ),
  paged as (
    select * from matching
    order by updated_at desc nulls last, id
    limit v_page_size offset (v_page - 1) * v_page_size
  )
  select
    (select total from counted),
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'assignmentId', id_assignment,
        'transactionId', id_transaction,
        'matterNumber', reference,
        'matterType', matter_type,
        'stage', stage_label,
        'nextAction', next_action,
        'nextActionDueAt', next_action_due_at,
        'targetRegistrationDate', target_registration_date,
        'riskStatus', risk_status,
        'lifecycleState', lifecycle_state,
        'registrationDate', registration_date,
        'buyerName', buyer_name,
        'propertyLabel', property_label,
        'value', value,
        'updatedAt', updated_at
      ) order by updated_at desc nulls last, id_transaction)
      from (
        select
          paged.assignment_id as id_assignment,
          paged.id as id_transaction,
          coalesce(paged.matter_number, paged.transaction_reference, paged.id::text) as reference,
          coalesce(paged.attorney_role, paged.assignment_type, '') as matter_type,
          coalesce(paged.attorney_stage, paged.current_sub_stage_summary, paged.current_main_stage, paged.stage, '') as stage_label,
          paged.next_action,
          paged.next_action_due_at,
          paged.target_registration_date,
          coalesce(paged.risk_status, paged.operational_state, '') as risk_status,
          paged.lifecycle_state,
          paged.registration_date,
          paged.buyer_name,
          concat_ws(', ', nullif(paged.property_description, ''), nullif(paged.property_address_line_1, ''), nullif(paged.suburb, ''), nullif(paged.city, '')) as property_label,
          paged.value,
          paged.updated_at
        from paged
      ) row_payload
    ), '[]'::jsonb)
  into v_total, v_rows;

  if nullif(trim(coalesce(p_search, '')), '') is null and v_total <> jsonb_array_length(v_ids) then
    raise exception 'Attorney dashboard metric drill-down does not reconcile with its source.' using errcode = '55000';
  end if;

  return jsonb_build_object(
    'contract', 'arch9-attorney-dashboard-metric-page-v1',
    'view', 'all',
    'metric', jsonb_build_object('group', v_group, 'key', v_key),
    'pagination', jsonb_build_object('page', v_page, 'pageSize', v_page_size, 'totalRows', v_total),
    'rows', v_rows,
    'access', jsonb_build_object('activeMembership', true, 'scope', 'firm')
  );
end;
$$;

revoke all on function public.get_attorney_dashboard_metric_matter_page(uuid, text, text, text, integer, integer, text) from public, anon;
grant execute on function public.get_attorney_dashboard_metric_matter_page(uuid, text, text, text, integer, integer, text) to authenticated;

commit;
