begin;

create or replace function public.rental_get_pilot_readiness()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_scope jsonb;
  v_checks jsonb;
begin
  if auth.uid() is null then raise exception 'Not authorized'; end if;

  with accessible_properties as materialized (
    select property.id from public.rental_properties property where public.rental_branch_access(property.organisation_id, property.branch_id)
  ), accessible_units as materialized (
    select unit.id, unit.property_id from public.rental_units unit join accessible_properties property on property.id = unit.property_id
  ), accessible_tenancies as materialized (
    select tenancy.id, tenancy.status from public.rental_tenancies tenancy join accessible_properties property on property.id = tenancy.property_id
  )
  select jsonb_build_object(
    'properties', (select count(*) from accessible_properties),
    'units', (select count(*) from accessible_units),
    'vacancies', (select count(*) from public.rental_vacancies vacancy join accessible_properties property on property.id = vacancy.property_id),
    'active_tenancies', (select count(*) from accessible_tenancies where status in ('active', 'notice_given', 'move_out_pending'))
  ) into v_scope;

  with accessible_properties as materialized (
    select property.id from public.rental_properties property where public.rental_branch_access(property.organisation_id, property.branch_id)
  ), accessible_units as materialized (
    select unit.id, unit.property_id from public.rental_units unit join accessible_properties property on property.id = unit.property_id
  ), accessible_tenancies as materialized (
    select tenancy.id, tenancy.status from public.rental_tenancies tenancy join accessible_properties property on property.id = tenancy.property_id
  ), checks as (
    select 'portfolio'::text as key, 'At least one managed property is in scope'::text as title, case when (select count(*) from accessible_properties) > 0 then 'pass' else 'blocked' end as status, (select count(*) from accessible_properties)::text as detail
    union all
    select 'units', 'Every pilot property has at least one unit', case when exists(select 1 from accessible_properties property where not exists(select 1 from accessible_units unit where unit.property_id = property.id)) then 'blocked' when (select count(*) from accessible_properties) = 0 then 'blocked' else 'pass' end, (select count(*) from accessible_properties property where not exists(select 1 from accessible_units unit where unit.property_id = property.id))::text
    union all
    select 'vacancy_marketing', 'Open vacancies have an internal marketing record', case when exists(select 1 from public.rental_vacancies vacancy join accessible_properties property on property.id = vacancy.property_id where vacancy.status not in ('let', 'withdrawn') and not exists(select 1 from public.rental_vacancy_marketing marketing where marketing.vacancy_id = vacancy.id and marketing.status not in ('archived'))) then 'warning' else 'pass' end, (select count(*) from public.rental_vacancies vacancy join accessible_properties property on property.id = vacancy.property_id where vacancy.status not in ('let', 'withdrawn') and not exists(select 1 from public.rental_vacancy_marketing marketing where marketing.vacancy_id = vacancy.id and marketing.status not in ('archived')))::text
    union all
    select 'leases', 'Active tenancies have a current lease version', case when exists(select 1 from accessible_tenancies tenancy where tenancy.status in ('active', 'notice_given', 'move_out_pending') and not exists(select 1 from public.rental_leases lease join public.rental_lease_versions version on version.lease_id = lease.id where lease.tenancy_id = tenancy.id and version.is_current)) then 'blocked' else 'pass' end, (select count(*) from accessible_tenancies tenancy where tenancy.status in ('active', 'notice_given', 'move_out_pending') and not exists(select 1 from public.rental_leases lease join public.rental_lease_versions version on version.lease_id = lease.id where lease.tenancy_id = tenancy.id and version.is_current))::text
    union all
    select 'charges', 'Active tenancies have a rent schedule', case when exists(select 1 from accessible_tenancies tenancy where tenancy.status in ('active', 'notice_given', 'move_out_pending') and not exists(select 1 from public.rental_charge_schedules schedule where schedule.tenancy_id = tenancy.id and schedule.status = 'active')) then 'warning' else 'pass' end, (select count(*) from accessible_tenancies tenancy where tenancy.status in ('active', 'notice_given', 'move_out_pending') and not exists(select 1 from public.rental_charge_schedules schedule where schedule.tenancy_id = tenancy.id and schedule.status = 'active'))::text
    union all
    select 'access', 'Scope is evaluated through current branch access', 'pass', (select count(*) from accessible_properties)::text
  )
  select coalesce(jsonb_agg(jsonb_build_object('key', key, 'title', title, 'status', status, 'affected_count', detail::integer) order by case status when 'blocked' then 0 when 'warning' then 1 else 2 end, key), '[]'::jsonb) into v_checks from checks;

  return jsonb_build_object(
    'version', 'arch9_rental_pilot_readiness_v1',
    'as_of', now(),
    'scope', v_scope,
    'checks', v_checks,
    'import_boundary', 'No source rows are written automatically. Validate a small portfolio against this checklist, then capture it through the existing Rentals property, unit, vacancy and tenancy workflows.'
  );
end;
$$;

revoke all on function public.rental_get_pilot_readiness() from public, anon;
grant execute on function public.rental_get_pilot_readiness() to authenticated;

commit;
