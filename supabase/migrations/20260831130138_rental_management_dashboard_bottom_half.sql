begin;

create or replace function public.rental_get_management_dashboard_bottom_half(
  p_organisation_id uuid,
  p_branch_id uuid default null,
  p_scope text default 'company',
  p_range_days integer default 30
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_scope text := case when lower(coalesce(p_scope, 'company')) = 'agent' then 'agent' else 'company' end;
  v_days integer := greatest(7, least(coalesce(p_range_days, 30), 90));
  v_can_view_company boolean;
  v_portfolio jsonb;
  v_vacancy jsonb;
  v_renewals jsonb;
  v_collections jsonb;
  v_maintenance jsonb;
  v_activity jsonb;
begin
  if (select auth.uid()) is null or p_organisation_id is null then raise exception 'Not authorized'; end if;
  if p_branch_id is not null and not public.rental_branch_access(p_organisation_id, p_branch_id) then raise exception 'Not authorized for the selected branch'; end if;
  v_can_view_company := public.bridge_is_org_admin(p_organisation_id);
  if v_scope = 'company' and not v_can_view_company then v_scope := 'agent'; end if;

  with scoped_properties as materialized (
    select property.id, property.branch_id
    from public.rental_properties property
    where property.organisation_id = p_organisation_id and property.status = 'active'
      and public.rental_branch_access(property.organisation_id, property.branch_id)
      and (p_branch_id is null or property.branch_id = p_branch_id)
      and (v_scope = 'company' or property.assigned_manager_id = (select auth.uid()) or exists (select 1 from public.rental_vacancies vacancy where vacancy.property_id = property.id and vacancy.assigned_agent_id = (select auth.uid())))
  ), active_mandates as materialized (
    select mandate.property_id from public.rental_property_mandates mandate join scoped_properties property on property.id = mandate.property_id
    where mandate.mandate_status = 'active' and mandate.authority_status = 'confirmed'
      and (mandate.starts_on is null or mandate.starts_on <= current_date) and (mandate.ends_on is null or mandate.ends_on >= current_date)
  ), managed_units as materialized (
    select unit.id, unit.status from public.rental_units unit join (select distinct property_id from active_mandates) mandate on mandate.property_id = unit.property_id
  ), active_tenancies as materialized (
    select tenancy.id, tenancy.unit_id, tenancy.status, tenancy.intended_occupation_date
    from public.rental_tenancies tenancy join managed_units unit on unit.id = tenancy.unit_id
    where tenancy.status in ('active', 'notice_given', 'move_out_pending')
  ), current_versions as materialized (
    select tenancy.id as tenancy_id, tenancy.status as tenancy_status, tenancy.intended_occupation_date, version.monthly_rent, version.effective_end_date, version.occupation_date
    from active_tenancies tenancy join public.rental_leases lease on lease.tenancy_id = tenancy.id
      join public.rental_lease_versions version on version.lease_id = lease.id and version.is_current
  )
  select jsonb_build_object(
    'managed_units', (select count(*) from managed_units),
    'occupied_units', (select count(*) from managed_units where status = 'occupied'),
    'vacant_units', (select count(*) from managed_units where status in ('vacant', 'marketing', 'application_pending', 'lease_pending', 'maintenance_hold')),
    'becoming_available_30_days', (select count(*) from current_versions where tenancy_status in ('notice_given', 'move_out_pending') or effective_end_date between current_date and current_date + 30),
    'monthly_rent_roll', (select coalesce(sum(monthly_rent), 0) from current_versions),
    'units_occupied_this_month', (select count(*) from current_versions where coalesce(occupation_date, intended_occupation_date) >= date_trunc('month', current_date)::date and coalesce(occupation_date, intended_occupation_date) < (date_trunc('month', current_date) + interval '1 month')::date),
    'new_vacancies_this_month', (select count(*) from public.rental_vacancies vacancy join scoped_properties property on property.id = vacancy.property_id where vacancy.created_at >= date_trunc('month', now())),
    'leases_commenced_this_month', (select count(*) from current_versions where coalesce(occupation_date, intended_occupation_date) >= date_trunc('month', current_date)::date and coalesce(occupation_date, intended_occupation_date) < (date_trunc('month', current_date) + interval '1 month')::date),
    'occupancy_rate', case when (select count(*) from managed_units) = 0 then null else round(100.0 * (select count(*) from managed_units where status = 'occupied') / (select count(*) from managed_units), 1) end
  ) into v_portfolio;

  with scoped_properties as materialized (
    select property.id from public.rental_properties property
    where property.organisation_id = p_organisation_id and property.status = 'active' and public.rental_branch_access(property.organisation_id, property.branch_id)
      and (p_branch_id is null or property.branch_id = p_branch_id)
      and (v_scope = 'company' or property.assigned_manager_id = (select auth.uid()) or exists (select 1 from public.rental_vacancies vacancy where vacancy.property_id = property.id and vacancy.assigned_agent_id = (select auth.uid())))
  ), scoped_vacancies as materialized (
    select vacancy.id, vacancy.unit_id, vacancy.status, vacancy.available_from, vacancy.asking_rent, vacancy.created_at
    from public.rental_vacancies vacancy join scoped_properties property on property.id = vacancy.property_id
    where v_scope = 'company' or vacancy.assigned_agent_id = (select auth.uid())
  ), active_mandates as materialized (
    select mandate.property_id from public.rental_property_mandates mandate join scoped_properties property on property.id = mandate.property_id
    where mandate.mandate_status = 'active' and mandate.authority_status = 'confirmed' and (mandate.ends_on is null or mandate.ends_on >= current_date)
  ), managed_units as materialized (
    select unit.id, unit.status from public.rental_units unit join (select distinct property_id from active_mandates) mandate on mandate.property_id = unit.property_id
  ), vacancy_applications as materialized (
    select application.id, application.vacancy_id, application.status, coalesce(application.submitted_at, application.created_at) as applied_at
    from public.rental_applications application join scoped_vacancies vacancy on vacancy.id = application.vacancy_id
  ), current_rents as materialized (
    select tenancy.source_application_id, version.monthly_rent
    from public.rental_tenancies tenancy join public.rental_leases lease on lease.tenancy_id = tenancy.id
      join public.rental_lease_versions version on version.lease_id = lease.id and version.is_current
    where tenancy.status in ('active', 'notice_given', 'move_out_pending')
  )
  select jsonb_build_object(
    'vacant', (select count(*) from managed_units where status = 'vacant'),
    'marketing', (select count(*) from scoped_vacancies where status = 'marketing'),
    'applications', (select count(distinct vacancy_id) from vacancy_applications where status in ('submitted', 'under_review')),
    'approved', (select count(distinct vacancy_id) from vacancy_applications where status = 'approved'),
    'awaiting_lease', (select count(*) from public.rental_tenancies tenancy join public.rental_leases lease on lease.tenancy_id = tenancy.id join scoped_vacancies vacancy on vacancy.unit_id = tenancy.unit_id where tenancy.status in ('draft', 'move_in_pending') and lease.status in ('draft', 'awaiting_tenant', 'awaiting_landlord')),
    'average_days_vacant', (select round(avg(greatest(0, current_date - available_from))::numeric, 1) from scoped_vacancies where available_from is not null and status not in ('withdrawn', 'let')),
    'average_days_to_first_application', (select round(avg(greatest(0, applied_at::date - vacancy.created_at::date))::numeric, 1) from scoped_vacancies vacancy join lateral (select min(applied_at) as applied_at from vacancy_applications application where application.vacancy_id = vacancy.id) first_application on first_application.applied_at is not null),
    'applications_per_vacancy', case when (select count(*) from scoped_vacancies where status in ('marketing', 'applications_open', 'let')) = 0 then null else round((select count(*) from vacancy_applications)::numeric / (select count(*) from scoped_vacancies where status in ('marketing', 'applications_open', 'let')), 1) end,
    'let_this_month', (select count(*) from public.rental_tenancies tenancy join scoped_properties property on property.id = tenancy.property_id where tenancy.status in ('active', 'notice_given', 'move_out_pending') and coalesce(tenancy.intended_occupation_date, tenancy.created_at::date) >= date_trunc('month', current_date)::date),
    'average_achieved_rent_percent', (select round(100.0 * avg(rent.monthly_rent / nullif(vacancy.asking_rent, 0)), 1) from current_rents rent join vacancy_applications application on application.id = rent.source_application_id join scoped_vacancies vacancy on vacancy.id = application.vacancy_id where vacancy.asking_rent > 0)
  ) into v_vacancy;

  with scoped_properties as materialized (
    select property.id from public.rental_properties property
    where property.organisation_id = p_organisation_id and property.status = 'active' and public.rental_branch_access(property.organisation_id, property.branch_id)
      and (p_branch_id is null or property.branch_id = p_branch_id)
      and (v_scope = 'company' or property.assigned_manager_id = (select auth.uid()) or exists (select 1 from public.rental_vacancies vacancy where vacancy.property_id = property.id and vacancy.assigned_agent_id = (select auth.uid())))
  ), expiring as materialized (
    select tenancy.id, tenancy.status as tenancy_status, version.effective_end_date
    from public.rental_tenancies tenancy join scoped_properties property on property.id = tenancy.property_id
      join public.rental_leases lease on lease.tenancy_id = tenancy.id join public.rental_lease_versions version on version.lease_id = lease.id and version.is_current
    where tenancy.status in ('active', 'notice_given', 'move_out_pending') and version.effective_end_date between current_date and current_date + 90
  ), renewal_status as materialized (
    select renewal.tenancy_id, renewal.status from public.rental_renewals renewal join expiring tenancy on tenancy.id = renewal.tenancy_id
  )
  select jsonb_build_object(
    'buckets', jsonb_build_object(
      'next_30', jsonb_build_object('expiring', (select count(*) from expiring where effective_end_date <= current_date + 30), 'offered', (select count(*) from expiring tenancy join renewal_status renewal on renewal.tenancy_id = tenancy.id where tenancy.effective_end_date <= current_date + 30 and renewal.status in ('awaiting_intentions', 'under_review')), 'accepted', (select count(*) from expiring tenancy join renewal_status renewal on renewal.tenancy_id = tenancy.id where tenancy.effective_end_date <= current_date + 30 and renewal.status = 'accepted'), 'vacating', (select count(*) from expiring where tenancy_status in ('notice_given', 'move_out_pending'))),
      'days_31_60', jsonb_build_object('expiring', (select count(*) from expiring where effective_end_date > current_date + 30 and effective_end_date <= current_date + 60), 'offered', (select count(*) from expiring tenancy join renewal_status renewal on renewal.tenancy_id = tenancy.id where tenancy.effective_end_date > current_date + 30 and tenancy.effective_end_date <= current_date + 60 and renewal.status in ('awaiting_intentions', 'under_review')), 'accepted', (select count(*) from expiring tenancy join renewal_status renewal on renewal.tenancy_id = tenancy.id where tenancy.effective_end_date > current_date + 30 and tenancy.effective_end_date <= current_date + 60 and renewal.status = 'accepted'), 'vacating', (select count(*) from expiring where tenancy_status in ('notice_given', 'move_out_pending') and effective_end_date > current_date + 30 and effective_end_date <= current_date + 60)),
      'days_61_90', jsonb_build_object('expiring', (select count(*) from expiring where effective_end_date > current_date + 60), 'offered', (select count(*) from expiring tenancy join renewal_status renewal on renewal.tenancy_id = tenancy.id where tenancy.effective_end_date > current_date + 60 and renewal.status in ('awaiting_intentions', 'under_review')), 'accepted', (select count(*) from expiring tenancy join renewal_status renewal on renewal.tenancy_id = tenancy.id where tenancy.effective_end_date > current_date + 60 and renewal.status = 'accepted'), 'vacating', (select count(*) from expiring where tenancy_status in ('notice_given', 'move_out_pending') and effective_end_date > current_date + 60))
    ),
    'requires_action', (select count(*) from expiring tenancy where tenancy.effective_end_date <= current_date + 30 and not exists (select 1 from renewal_status renewal where renewal.tenancy_id = tenancy.id))
  ) into v_renewals;

  v_collections := jsonb_build_object('mode', 'unavailable', 'monthly_rent_roll', coalesce((v_portfolio ->> 'monthly_rent_roll')::numeric, 0));

  with scoped_properties as materialized (
    select property.id from public.rental_properties property
    where property.organisation_id = p_organisation_id and property.status = 'active' and public.rental_branch_access(property.organisation_id, property.branch_id)
      and (p_branch_id is null or property.branch_id = p_branch_id)
      and (v_scope = 'company' or property.assigned_manager_id = (select auth.uid()))
  ), requests as materialized (
    select request.id, request.status, request.reported_at from public.rental_maintenance_requests request join scoped_properties property on property.id = request.property_id
  )
  select jsonb_build_object('open', (select count(*) from requests where status not in ('resolved', 'cancelled')), 'in_progress', (select count(*) from requests where status in ('triaged', 'assigned')), 'awaiting_landlord_approval', null, 'completed_this_month', (select count(*) from requests where status = 'resolved' and reported_at >= date_trunc('month', now()))) into v_maintenance;

  with scoped_properties as materialized (
    select property.id, property.name from public.rental_properties property
    where property.organisation_id = p_organisation_id and property.status = 'active' and public.rental_branch_access(property.organisation_id, property.branch_id)
      and (p_branch_id is null or property.branch_id = p_branch_id)
      and (v_scope = 'company' or property.assigned_manager_id = (select auth.uid()) or exists (select 1 from public.rental_vacancies vacancy where vacancy.property_id = property.id and vacancy.assigned_agent_id = (select auth.uid())))
  ), activity as (
    select coalesce(application.submitted_at, application.created_at) occurred_at, 'application' kind, 'Application received' title, property.name subtitle, '/agent/rentals/applications' href from public.rental_applications application join public.rental_vacancies vacancy on vacancy.id = application.vacancy_id join scoped_properties property on property.id = vacancy.property_id where application.status in ('submitted', 'under_review')
    union all select vacancy.created_at, 'vacancy', 'Vacancy created', property.name, '/agent/rentals/vacancies' from public.rental_vacancies vacancy join scoped_properties property on property.id = vacancy.property_id
    union all select request.reported_at, case when request.status = 'resolved' then 'maintenance_resolved' else 'maintenance' end, case when request.status = 'resolved' then 'Maintenance request resolved' else 'Maintenance request created' end, property.name, '/agent/rentals/maintenance' from public.rental_maintenance_requests request join scoped_properties property on property.id = request.property_id
    union all select notice.submitted_at, 'notice', 'Tenant gave notice', property.name, '/agent/rentals/tenancies' from public.rental_notices notice join public.rental_tenancies tenancy on tenancy.id = notice.tenancy_id join scoped_properties property on property.id = tenancy.property_id where notice.status not in ('withdrawn')
    union all select renewal.decided_at, 'renewal', 'Renewal accepted', property.name, '/agent/rentals/tenancies' from public.rental_renewals renewal join public.rental_tenancies tenancy on tenancy.id = renewal.tenancy_id join scoped_properties property on property.id = tenancy.property_id where renewal.status = 'accepted' and renewal.decided_at is not null
  )
  select coalesce(jsonb_agg(jsonb_build_object('occurred_at', occurred_at, 'kind', kind, 'title', title, 'subtitle', subtitle, 'href', href) order by occurred_at desc), '[]'::jsonb) into v_activity from (select * from activity where occurred_at >= now() - make_interval(days => v_days) order by occurred_at desc limit 12) limited;

  return jsonb_build_object('version', 'arch9_rental_management_dashboard_bottom_half_v1', 'as_of', now(), 'effective_scope', v_scope, 'portfolio_health', v_portfolio, 'vacancy_letting', v_vacancy, 'renewals', v_renewals, 'collections', v_collections, 'maintenance', v_maintenance, 'recent_activity', v_activity);
end;
$$;

revoke all on function public.rental_get_management_dashboard_bottom_half(uuid, uuid, text, integer) from public, anon;
grant execute on function public.rental_get_management_dashboard_bottom_half(uuid, uuid, text, integer) to authenticated;

create index if not exists rental_dashboard_renewal_tenancy_status_idx on public.rental_renewals (tenancy_id, status);
create index if not exists rental_dashboard_maintenance_property_status_idx on public.rental_maintenance_requests (property_id, status, reported_at desc);

commit;
