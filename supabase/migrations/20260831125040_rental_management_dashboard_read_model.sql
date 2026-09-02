begin;

-- A single, access-scoped read model keeps the Rentals landing page quick without
-- moving financial or tenancy logic into the browser.  `company` is available to
-- organisation admins; all other members transparently receive their own workload.
create or replace function public.rental_get_management_dashboard(
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
  v_metrics jsonb;
  v_occupancy jsonb;
  v_applications jsonb;
  v_mandates jsonb;
  v_rent_roll jsonb;
begin
  if (select auth.uid()) is null or p_organisation_id is null then
    raise exception 'Not authorized';
  end if;

  if p_branch_id is not null and not public.rental_branch_access(p_organisation_id, p_branch_id) then
    raise exception 'Not authorized for the selected branch';
  end if;

  v_can_view_company := public.bridge_is_org_admin(p_organisation_id);
  if v_scope = 'company' and not v_can_view_company then
    v_scope := 'agent';
  end if;

  with scoped_properties as materialized (
    select property.id, property.organisation_id, property.branch_id
    from public.rental_properties property
    where property.organisation_id = p_organisation_id
      and property.status = 'active'
      and public.rental_branch_access(property.organisation_id, property.branch_id)
      and (p_branch_id is null or property.branch_id = p_branch_id)
      and (
        v_scope = 'company'
        or property.assigned_manager_id = (select auth.uid())
        or exists (
          select 1 from public.rental_vacancies vacancy
          where vacancy.property_id = property.id
            and vacancy.assigned_agent_id = (select auth.uid())
        )
      )
  ), active_mandates as materialized (
    select mandate.id, mandate.property_id
    from public.rental_property_mandates mandate
    join scoped_properties property on property.id = mandate.property_id
    where mandate.mandate_status = 'active'
      and mandate.authority_status = 'confirmed'
      and (mandate.starts_on is null or mandate.starts_on <= current_date)
      and (mandate.ends_on is null or mandate.ends_on >= current_date)
  ), managed_units as materialized (
    select unit.id, unit.property_id, unit.status
    from public.rental_units unit
    join (select distinct property_id from active_mandates) mandate on mandate.property_id = unit.property_id
  ), active_tenancies as materialized (
    select tenancy.id, tenancy.property_id, tenancy.unit_id
    from public.rental_tenancies tenancy
    join managed_units unit on unit.id = tenancy.unit_id
    where tenancy.status in ('active', 'notice_given', 'move_out_pending')
  ), active_applications as materialized (
    select application.id, application.status, application.submitted_at, application.created_at,
           application.unit_id, application.vacancy_id
    from public.rental_applications application
    join public.rental_vacancies vacancy on vacancy.id = application.vacancy_id
    join scoped_properties property on property.id = vacancy.property_id
    where application.status in ('submitted', 'under_review')
      and (v_scope = 'company' or vacancy.assigned_agent_id = (select auth.uid()))
  ), current_lease_rent as materialized (
    select tenancy.id as tenancy_id, coalesce(version.monthly_rent, 0) as monthly_rent, version.effective_end_date
    from active_tenancies tenancy
    join public.rental_leases lease on lease.tenancy_id = tenancy.id
    join public.rental_lease_versions version on version.lease_id = lease.id and version.is_current
  ), rental_leads as materialized (
    select lead.lead_id, lead.created_at
    from public.leads lead
    where lead.organisation_id = p_organisation_id
      and coalesce(lead.raw_enquiry_payload ->> 'classification', '') = 'rental'
      and (p_branch_id is null or lead.branch_id = p_branch_id)
      and (
        (v_scope = 'company' and v_can_view_company)
        or (v_scope = 'agent' and (lead.assigned_agent_id = (select auth.uid()) or lead.assigned_user_id = (select auth.uid()) or lead.created_by = (select auth.uid())))
      )
  )
  select jsonb_build_object(
    'active_applications', (select count(*) from active_applications),
    'active_mandates', (select count(*) from active_mandates),
    'occupied_units', (select count(*) from managed_units where status = 'occupied'),
    'vacant_units', (select count(*) from managed_units where status in ('vacant', 'marketing', 'application_pending', 'lease_pending', 'maintenance_hold')),
    'total_units', (select count(*) from managed_units),
    'occupancy_rate', case when (select count(*) from managed_units) = 0 then null else round(100.0 * (select count(*) from managed_units where status = 'occupied') / (select count(*) from managed_units), 1) end,
    'monthly_rent_roll', (select coalesce(sum(monthly_rent), 0) from current_lease_rent),
    'new_leads', (select count(*) from rental_leads where created_at >= now() - make_interval(days => v_days)),
    'new_leads_previous_period', (select count(*) from rental_leads where created_at >= now() - make_interval(days => v_days * 2) and created_at < now() - make_interval(days => v_days)),
    'active_tenancies', (select count(*) from active_tenancies)
  ) into v_metrics;

  select jsonb_build_object(
    'occupied_units', coalesce((v_metrics ->> 'occupied_units')::integer, 0),
    'vacant_units', coalesce((v_metrics ->> 'vacant_units')::integer, 0),
    'total_units', coalesce((v_metrics ->> 'total_units')::integer, 0),
    'occupancy_rate', (v_metrics ->> 'occupancy_rate')::numeric
  ) into v_occupancy;

  with scoped_properties as materialized (
    select property.id from public.rental_properties property
    where property.organisation_id = p_organisation_id and property.status = 'active'
      and public.rental_branch_access(property.organisation_id, property.branch_id)
      and (p_branch_id is null or property.branch_id = p_branch_id)
      and (v_scope = 'company' or property.assigned_manager_id = (select auth.uid()) or exists (select 1 from public.rental_vacancies vacancy where vacancy.property_id = property.id and vacancy.assigned_agent_id = (select auth.uid())))
  ), cards as (
    select application.id, application.status, application.submitted_at, application.created_at,
      unit.unit_label, property.name as property_name, coalesce(vacancy.asking_rent, unit.target_rent) as monthly_rent,
      case when application.status = 'submitted' then 'new' else 'screening' end as stage
    from public.rental_applications application
    join public.rental_vacancies vacancy on vacancy.id = application.vacancy_id
    join scoped_properties property_scope on property_scope.id = vacancy.property_id
    join public.rental_properties property on property.id = vacancy.property_id
    left join public.rental_units unit on unit.id = application.unit_id
    where application.status in ('submitted', 'under_review')
      and (v_scope = 'company' or vacancy.assigned_agent_id = (select auth.uid()))
    order by coalesce(application.submitted_at, application.created_at) asc
    limit 12
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'stage', stage, 'status', status, 'submitted_at', submitted_at,
    'property_name', property_name, 'unit_label', unit_label, 'monthly_rent', monthly_rent
  )), '[]'::jsonb) into v_applications from cards;

  with scoped_properties as materialized (
    select property.id from public.rental_properties property
    where property.organisation_id = p_organisation_id and property.status = 'active'
      and public.rental_branch_access(property.organisation_id, property.branch_id)
      and (p_branch_id is null or property.branch_id = p_branch_id)
      and (v_scope = 'company' or property.assigned_manager_id = (select auth.uid()) or exists (select 1 from public.rental_vacancies vacancy where vacancy.property_id = property.id and vacancy.assigned_agent_id = (select auth.uid())))
  )
  select jsonb_build_object(
    'active', (select count(*) from public.rental_property_mandates mandate join scoped_properties property on property.id = mandate.property_id where mandate.mandate_status = 'active' and mandate.authority_status = 'confirmed' and (mandate.ends_on is null or mandate.ends_on >= current_date)),
    'marketed', (select count(*) from public.rental_vacancies vacancy join scoped_properties property on property.id = vacancy.property_id where vacancy.status in ('marketing', 'applications_open')),
    'vacant', (select count(*) from public.rental_units unit join scoped_properties property on property.id = unit.property_id where unit.status in ('vacant', 'marketing', 'application_pending', 'lease_pending', 'maintenance_hold')),
    'applications_this_period', (select count(*) from public.rental_applications application join public.rental_vacancies vacancy on vacancy.id = application.vacancy_id join scoped_properties property on property.id = vacancy.property_id where coalesce(application.submitted_at, application.created_at) >= now() - make_interval(days => v_days))
  ) into v_mandates;

  with scoped_properties as materialized (
    select property.id from public.rental_properties property
    where property.organisation_id = p_organisation_id and property.status = 'active'
      and public.rental_branch_access(property.organisation_id, property.branch_id)
      and (p_branch_id is null or property.branch_id = p_branch_id)
      and (v_scope = 'company' or property.assigned_manager_id = (select auth.uid()) or exists (select 1 from public.rental_vacancies vacancy where vacancy.property_id = property.id and vacancy.assigned_agent_id = (select auth.uid())))
  ), active_tenancies as materialized (
    select tenancy.id from public.rental_tenancies tenancy join scoped_properties property on property.id = tenancy.property_id where tenancy.status in ('active', 'notice_given', 'move_out_pending')
  ), current_versions as materialized (
    select version.monthly_rent, version.effective_end_date from active_tenancies tenancy join public.rental_leases lease on lease.tenancy_id = tenancy.id join public.rental_lease_versions version on version.lease_id = lease.id and version.is_current
  )
  select jsonb_build_object(
    'active_tenancies', (select count(*) from active_tenancies),
    'contractual_rent_roll', (select coalesce(sum(monthly_rent), 0) from current_versions),
    'leases_expiring_90_days', (select count(*) from current_versions where effective_end_date between current_date and current_date + 90)
  ) into v_rent_roll;

  return jsonb_build_object(
    'version', 'arch9_rental_management_dashboard_v1',
    'as_of', now(),
    'effective_scope', v_scope,
    'range_days', v_days,
    'metrics', v_metrics,
    'occupancy', v_occupancy,
    'applications', v_applications,
    'mandate_overview', v_mandates,
    'rent_roll_overview', v_rent_roll
  );
end;
$$;

revoke all on function public.rental_get_management_dashboard(uuid, uuid, text, integer) from public, anon;
grant execute on function public.rental_get_management_dashboard(uuid, uuid, text, integer) to authenticated;

create index if not exists rental_dashboard_property_scope_idx
  on public.rental_properties (organisation_id, branch_id, assigned_manager_id)
  where status = 'active';
create index if not exists rental_dashboard_application_vacancy_status_idx
  on public.rental_applications (vacancy_id, status, submitted_at desc);
create index if not exists rental_dashboard_vacancy_property_agent_idx
  on public.rental_vacancies (property_id, assigned_agent_id, status);
create index if not exists rental_dashboard_lease_current_idx
  on public.rental_lease_versions (lease_id, effective_end_date)
  where is_current;

commit;
