-- Phase 3: attorney matter list read model.
-- The function deliberately starts at attorney assignments, so no firm-wide
-- transaction or appointment scan is needed to render a matter list.

create or replace function public.bridge_attorney_matter_list_snapshot(
  p_attorney_firm_id uuid,
  p_view text default 'all',
  p_page integer default 1,
  p_page_size integer default 20,
  p_search text default '',
  p_filters jsonb default '{}'::jsonb
)
returns jsonb
language sql
security invoker
set search_path = public
stable
as $$
with params as (
  select
    greatest(1, coalesce(p_page, 1)) as page_number,
    least(100, greatest(1, coalesce(p_page_size, 20))) as page_size,
    lower(trim(coalesce(p_view, 'all'))) as requested_view,
    nullif(trim(coalesce(p_search, '')), '') as search_term,
    coalesce(p_filters, '{}'::jsonb) as filters
),
membership as (
  select member.role
  from public.attorney_firm_members member
  where member.firm_id = p_attorney_firm_id
    and member.user_id = auth.uid()
    and member.status = 'active'
  limit 1
),
scoped_assignments as (
  select distinct on (assignment.transaction_id)
    assignment.id as assignment_id,
    assignment.transaction_id,
    assignment.attorney_role,
    assignment.assignment_type,
    assignment.assignment_status,
    assignment.primary_attorney_id,
    assignment.attorney_user_id,
    assignment.secretary_id,
    assignment.admin_handler_id,
    assignment.updated_at as assignment_updated_at
  from public.transaction_attorney_assignments assignment
  cross join membership
  cross join params
  where assignment.attorney_firm_id = p_attorney_firm_id
    and assignment.assignment_status in ('pending', 'active', 'paused')
    and (
      membership.role in ('firm_admin', 'director_partner')
      or auth.uid() in (
        assignment.primary_attorney_id,
        assignment.attorney_user_id,
        assignment.secretary_id,
        assignment.admin_handler_id
      )
    )
    and (
      params.requested_view = 'all'
      or (params.requested_view = 'transfer' and lower(coalesce(assignment.attorney_role, assignment.assignment_type, '')) in ('transfer', 'transfer_attorney', 'transfer_and_bond'))
      or (params.requested_view = 'bond' and lower(coalesce(assignment.attorney_role, assignment.assignment_type, '')) in ('bond', 'bond_attorney', 'transfer_and_bond'))
      or (params.requested_view = 'cancellation' and lower(coalesce(assignment.attorney_role, assignment.assignment_type, '')) in ('cancellation', 'cancellation_attorney'))
    )
  order by assignment.transaction_id, assignment.updated_at desc nulls last, assignment.id
),
scoped_matters as (
  select
    assignment.*,
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
    transaction.waiting_on_role,
    transaction.operational_state,
    transaction.updated_at,
    transaction.created_at,
    transaction.purchase_price,
    transaction.sales_price,
    transaction.property_description,
    transaction.property_address_line_1,
    transaction.property_address_line_2,
    transaction.suburb,
    transaction.city,
    transaction.province,
    transaction.buyer_id,
    buyer.name as buyer_name
  from scoped_assignments assignment
  join public.transactions transaction on transaction.id = assignment.transaction_id
  left join public.buyers buyer on buyer.id = transaction.buyer_id
  cross join params
  where transaction.is_active is distinct from false
    and (
      params.search_term is null
      or transaction.matter_number ilike '%' || params.search_term || '%'
      or transaction.transaction_reference ilike '%' || params.search_term || '%'
      or transaction.property_description ilike '%' || params.search_term || '%'
      or transaction.property_address_line_1 ilike '%' || params.search_term || '%'
      or buyer.name ilike '%' || params.search_term || '%'
    )
    and (
      coalesce(params.filters ->> 'stage', 'all') = 'all'
      or lower(coalesce(transaction.attorney_stage, transaction.current_sub_stage_summary, transaction.current_main_stage, transaction.stage, ''))
        like '%' || lower(params.filters ->> 'stage') || '%'
    )
    and (
      coalesce(params.filters ->> 'status', 'all') = 'all'
      or (params.filters ->> 'status' = 'delayed' and lower(coalesce(transaction.risk_status, transaction.operational_state, '')) in ('at_risk', 'at risk', 'delayed', 'red'))
      or (params.filters ->> 'status' = 'active' and lower(coalesce(transaction.risk_status, transaction.operational_state, '')) not in ('at_risk', 'at risk', 'delayed', 'red'))
    )
    and (
      coalesce(params.filters ->> 'priority', 'all') = 'all'
      or (params.filters ->> 'priority' in ('high', 'medium') and lower(coalesce(transaction.risk_status, transaction.operational_state, '')) in ('at_risk', 'at risk', 'delayed', 'red'))
      or (params.filters ->> 'priority' = 'normal' and lower(coalesce(transaction.risk_status, transaction.operational_state, '')) not in ('at_risk', 'at risk', 'delayed', 'red'))
    )
),
today_appointments as (
  select
    appointment.transaction_id,
    count(*)::integer as appointment_count
  from public.appointments appointment
  join scoped_matters matter on matter.id = appointment.transaction_id
  where coalesce(appointment.appointment_date, appointment.date_time::date) = current_date
    and coalesce(lower(appointment.status), '') not in ('cancelled', 'completed')
  group by appointment.transaction_id
),
aggregate as (
  select
    count(*)::integer as active_matters,
    count(*) filter (where lower(coalesce(matter.waiting_on_role, '')) in ('buyer', 'client'))::integer as awaiting_client,
    count(*) filter (
      where matter.next_action_due_at::date = current_date
        and lower(coalesce(matter.attorney_stage, matter.current_main_stage, '')) like '%lodgement%'
    )::integer as lodgement_today,
    count(*) filter (
      where matter.target_registration_date >= date_trunc('week', current_date)::date
        and matter.target_registration_date < (date_trunc('week', current_date) + interval '7 days')::date
    )::integer as registration_this_week,
    count(*) filter (
      where lower(coalesce(matter.risk_status, matter.operational_state, '')) in ('at_risk', 'at risk', 'delayed', 'red')
    )::integer as delayed_matters,
    coalesce(sum(coalesce(appointment.appointment_count, 0)), 0)::integer as appointments_today
  from scoped_matters matter
  left join today_appointments appointment on appointment.transaction_id = matter.id
),
ordered_matters as (
  select
    matter.*,
    coalesce(appointment.appointment_count, 0)::integer as appointments_today,
    count(*) over ()::integer as total_rows,
    row_number() over (order by matter.updated_at desc nulls last, matter.id) as row_number
  from scoped_matters matter
  left join today_appointments appointment on appointment.transaction_id = matter.id
),
paged_matters as (
  select ordered.*
  from ordered_matters ordered
  cross join params
  where ordered.row_number > (params.page_number - 1) * params.page_size
    and ordered.row_number <= params.page_number * params.page_size
)
select jsonb_build_object(
  'contract', 'arch9-attorney-matter-list-snapshot-v1',
  'view', (select requested_view from params),
  'pagination', jsonb_build_object(
    'page', (select page_number from params),
    'pageSize', (select page_size from params),
    'totalRows', coalesce((select max(total_rows) from ordered_matters), 0)
  ),
  'kpis', jsonb_build_object(
    'activeMatters', coalesce((select active_matters from aggregate), 0),
    'awaitingClient', coalesce((select awaiting_client from aggregate), 0),
    'lodgementToday', coalesce((select lodgement_today from aggregate), 0),
    'registrationThisWeek', coalesce((select registration_this_week from aggregate), 0),
    'delayedMatters', coalesce((select delayed_matters from aggregate), 0),
    'appointmentsToday', coalesce((select appointments_today from aggregate), 0)
  ),
  'rows', coalesce((
    select jsonb_agg(jsonb_build_object(
      'assignmentId', assignment_id,
      'transactionId', id,
      'matterNumber', coalesce(matter_number, transaction_reference, id::text),
      'matterType', coalesce(attorney_role, assignment_type, ''),
      'assignmentStatus', assignment_status,
      'stage', coalesce(attorney_stage, current_sub_stage_summary, current_main_stage, stage, ''),
      'nextAction', coalesce(next_action, ''),
      'nextActionDueAt', next_action_due_at,
      'targetRegistrationDate', target_registration_date,
      'riskStatus', coalesce(risk_status, operational_state, ''),
      'waitingOnRole', coalesce(waiting_on_role, ''),
      'buyerName', coalesce(buyer_name, ''),
      'propertyLabel', concat_ws(', ', nullif(property_description, ''), nullif(property_address_line_1, ''), nullif(suburb, ''), nullif(city, '')),
      'value', coalesce(sales_price, purchase_price),
      'updatedAt', updated_at,
      'appointmentsToday', appointments_today
    ) order by updated_at desc nulls last, id)
    from paged_matters
  ),
    '[]'::jsonb
  ),
  'access', jsonb_build_object(
    'activeMembership', exists(select 1 from membership),
    'scope', case when exists(select 1 from membership where role in ('firm_admin', 'director_partner')) then 'firm' else 'assigned' end
  )
);
$$;

revoke all on function public.bridge_attorney_matter_list_snapshot(uuid, text, integer, integer, text, jsonb) from public;
grant execute on function public.bridge_attorney_matter_list_snapshot(uuid, text, integer, integer, text, jsonb) to authenticated;

comment on function public.bridge_attorney_matter_list_snapshot(uuid, text, integer, integer, text, jsonb) is
  'Firm-scoped attorney matter read model: assignment-first rows, SQL KPIs and transaction-scoped today appointments.';
