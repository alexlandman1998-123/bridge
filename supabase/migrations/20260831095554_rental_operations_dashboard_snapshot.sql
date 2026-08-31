begin;

create or replace function public.rental_get_operations_dashboard()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_metrics jsonb;
  v_attention jsonb;
  v_upcoming jsonb;
begin
  if auth.uid() is null then raise exception 'Not authorized'; end if;

  with accessible_properties as materialized (
    select property.id, property.organisation_id, property.branch_id
    from public.rental_properties property
    where public.rental_branch_access(property.organisation_id, property.branch_id)
  ), accessible_tenancies as materialized (
    select tenancy.id, tenancy.property_id, tenancy.unit_id, tenancy.status
    from public.rental_tenancies tenancy
    join accessible_properties property on property.id = tenancy.property_id
  )
  select jsonb_build_object(
    'managed_properties', (select count(*) from accessible_properties),
    'total_units', (select count(*) from public.rental_units unit join accessible_properties property on property.id = unit.property_id),
    'occupied_units', (select count(*) from public.rental_units unit join accessible_properties property on property.id = unit.property_id where unit.status = 'occupied'),
    'vacant_units', (select count(*) from public.rental_units unit join accessible_properties property on property.id = unit.property_id where unit.status = 'vacant'),
    'open_vacancies', (select count(*) from public.rental_vacancies vacancy join accessible_properties property on property.id = vacancy.property_id where vacancy.status not in ('let', 'withdrawn')),
    'active_tenancies', (select count(*) from accessible_tenancies where status in ('active', 'notice_given', 'move_out_pending')),
    'applications_to_review', (select count(*) from public.rental_applications application join accessible_properties property on property.organisation_id = application.organisation_id join public.rental_vacancies vacancy on vacancy.id = application.vacancy_id and vacancy.property_id = property.id where application.status in ('submitted', 'under_review')),
    'notices_to_acknowledge', (select count(*) from public.rental_notices notice join accessible_tenancies tenancy on tenancy.id = notice.tenancy_id where notice.status = 'submitted'),
    'renewals_due', (select count(*) from public.rental_renewals renewal join accessible_tenancies tenancy on tenancy.id = renewal.tenancy_id where renewal.status in ('draft', 'awaiting_intentions', 'under_review') and renewal.response_due_on is not null and renewal.response_due_on <= current_date + 30),
    'urgent_maintenance', (select count(*) from public.rental_maintenance_requests request join accessible_tenancies tenancy on tenancy.id = request.tenancy_id where request.status not in ('resolved', 'cancelled') and request.priority in ('emergency', 'urgent'))
  ) into v_metrics;

  with accessible_properties as materialized (
    select property.id, property.organisation_id, property.branch_id from public.rental_properties property where public.rental_branch_access(property.organisation_id, property.branch_id)
  ), accessible_tenancies as materialized (
    select tenancy.id from public.rental_tenancies tenancy join accessible_properties property on property.id = tenancy.property_id
  ), items as (
    select 'notice'::text as kind, 'Notice awaiting acknowledgement'::text as title, notice.id::text as record_id, notice.tenancy_id::text as tenancy_id, notice.acknowledgement_due_on as due_on, case when notice.acknowledgement_due_on < current_date then 'overdue' else 'action' end as urgency
    from public.rental_notices notice join accessible_tenancies tenancy on tenancy.id = notice.tenancy_id where notice.status = 'submitted'
    union all
    select 'renewal', 'Renewal response due', renewal.id::text, renewal.tenancy_id::text, renewal.response_due_on, case when renewal.response_due_on < current_date then 'overdue' else 'action' end
    from public.rental_renewals renewal join accessible_tenancies tenancy on tenancy.id = renewal.tenancy_id where renewal.status in ('draft', 'awaiting_intentions', 'under_review') and renewal.response_due_on is not null and renewal.response_due_on <= current_date + 30
    union all
    select 'maintenance', case when request.priority = 'emergency' then 'Emergency maintenance request' else 'Urgent maintenance request' end, request.id::text, request.tenancy_id::text, request.reported_at::date, case when request.priority = 'emergency' then 'urgent' else 'action' end
    from public.rental_maintenance_requests request join accessible_tenancies tenancy on tenancy.id = request.tenancy_id where request.status not in ('resolved', 'cancelled') and request.priority in ('emergency', 'urgent')
    union all
    select 'application', 'Application awaiting review', application.id::text, null::text, application.submitted_at::date, 'action'
    from public.rental_applications application join public.rental_vacancies vacancy on vacancy.id = application.vacancy_id join accessible_properties property on property.id = vacancy.property_id where application.status in ('submitted', 'under_review')
  )
  select coalesce(jsonb_agg(jsonb_build_object('kind', kind, 'title', title, 'record_id', record_id, 'tenancy_id', tenancy_id, 'due_on', due_on, 'urgency', urgency) order by case urgency when 'urgent' then 0 when 'overdue' then 1 else 2 end, due_on nulls last), '[]'::jsonb) into v_attention from (select * from items order by case urgency when 'urgent' then 0 when 'overdue' then 1 else 2 end, due_on nulls last limit 12) limited;

  with accessible_properties as materialized (
    select property.id, property.organisation_id, property.branch_id from public.rental_properties property where public.rental_branch_access(property.organisation_id, property.branch_id)
  ), accessible_tenancies as materialized (
    select tenancy.id from public.rental_tenancies tenancy join accessible_properties property on property.id = tenancy.property_id
  ), items as (
    select 'notice_effective'::text as kind, 'Notice becomes effective'::text as title, notice.tenancy_id::text as tenancy_id, notice.effective_on as due_on
    from public.rental_notices notice join accessible_tenancies tenancy on tenancy.id = notice.tenancy_id where notice.status = 'acknowledged' and notice.effective_on between current_date and current_date + 30
    union all
    select 'renewal_due', 'Renewal response due', renewal.tenancy_id::text, renewal.response_due_on
    from public.rental_renewals renewal join accessible_tenancies tenancy on tenancy.id = renewal.tenancy_id where renewal.status in ('draft', 'awaiting_intentions', 'under_review') and renewal.response_due_on between current_date and current_date + 30
    union all
    select 'inspection', 'Inspection scheduled', schedule.tenancy_id::text, schedule.scheduled_for::date
    from public.rental_inspection_schedules schedule join accessible_tenancies tenancy on tenancy.id = schedule.tenancy_id where schedule.status = 'scheduled' and schedule.scheduled_for::date between current_date and current_date + 30
  )
  select coalesce(jsonb_agg(jsonb_build_object('kind', kind, 'title', title, 'tenancy_id', tenancy_id, 'due_on', due_on) order by due_on), '[]'::jsonb) into v_upcoming from (select * from items order by due_on limit 12) limited;

  return jsonb_build_object('version', 'arch9_rental_operations_dashboard_v2', 'as_of', now(), 'metrics', v_metrics, 'attention', v_attention, 'upcoming', v_upcoming);
end;
$$;

revoke all on function public.rental_get_operations_dashboard() from public, anon;
grant execute on function public.rental_get_operations_dashboard() to authenticated;

commit;
