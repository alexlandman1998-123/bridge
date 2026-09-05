-- Phase 2: application records belong to an optional shared CRM rental lead.
-- A lead may have many applications; every application still targets one vacancy.
alter table public.rental_applications
  add column if not exists lead_id uuid references public.leads(lead_id) on delete set null;

create index if not exists rental_applications_lead_updated_idx
  on public.rental_applications (lead_id, updated_at desc)
  where lead_id is not null;

comment on column public.rental_applications.lead_id is
  'Shared CRM rental lead that originated this application. Nullable for imported legacy applications.';

create or replace function public.rental_convert_application_to_tenancy(p_application_id uuid, p_expected_version integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  application_row public.rental_applications%rowtype;
  unit_row public.rental_units%rowtype;
  tenancy_id uuid;
  lease_id uuid;
  occupation_date date;
begin
  if auth.uid() is null then raise exception 'Authentication is required'; end if;
  select application.* into application_row from public.rental_applications application where application.id = p_application_id for update;
  if not found then raise exception 'Rental application not found'; end if;
  if not exists (
    select 1 from public.rental_vacancies vacancy
    join public.rental_properties property on property.id = vacancy.property_id
    where vacancy.id = application_row.vacancy_id
      and public.rental_branch_access(property.organisation_id, property.branch_id)
  ) then raise exception 'You are not authorized for this rental application'; end if;

  select tenancy.id into tenancy_id from public.rental_tenancies tenancy where tenancy.source_application_id = application_row.id;
  if tenancy_id is not null then
    select lease.id into lease_id from public.rental_leases lease where lease.tenancy_id = tenancy_id;
    if application_row.lead_id is not null then
      update public.leads
      set stage = 'Converted to tenancy',
          status = 'Converted to tenancy',
          raw_enquiry_payload = coalesce(raw_enquiry_payload, '{}'::jsonb) || jsonb_build_object(
            'stage', 'converted_to_tenancy',
            'relationships', coalesce(raw_enquiry_payload->'relationships', '{}'::jsonb) || jsonb_build_object(
              'applicationId', application_row.id::text,
              'tenancyId', tenancy_id::text
            )
          ),
          updated_at = now()
      where lead_id = application_row.lead_id and organisation_id = application_row.organisation_id;
    end if;
    return jsonb_build_object('tenancy_id', tenancy_id, 'lease_id', lease_id, 'lead_id', application_row.lead_id, 'idempotent', true);
  end if;

  if application_row.status <> 'approved' then raise exception 'Only an approved application can be converted to a tenancy'; end if;
  if application_row.version <> p_expected_version then raise exception 'This application changed. Refresh and try again.' using errcode = '40001'; end if;
  select unit.* into unit_row from public.rental_units unit where unit.id = application_row.unit_id for update;
  if not found or unit_row.organisation_id <> application_row.organisation_id then raise exception 'Rental unit does not match application'; end if;
  if unit_row.active_tenancy_id is not null or unit_row.status in ('lease_pending', 'occupied', 'notice_given', 'maintenance_hold') then raise exception 'This rental unit is not available for tenancy conversion'; end if;

  occupation_date := nullif(application_row.application_data #>> '{rentalHistory,intendedOccupationDate}', '')::date;
  insert into public.rental_tenancies(organisation_id, property_id, unit_id, source_application_id, intended_occupation_date, tenant_snapshot_json, created_by)
  select application_row.organisation_id, vacancy.property_id, application_row.unit_id, application_row.id, occupation_date,
    jsonb_build_object('identity', coalesce(application_row.application_data->'identity', '{}'::jsonb), 'employment', coalesce(application_row.application_data->'employment', '{}'::jsonb)), auth.uid()
  from public.rental_vacancies vacancy where vacancy.id = application_row.vacancy_id returning id into tenancy_id;

  if application_row.applicant_party_id is not null then
    insert into public.rental_tenancy_parties(tenancy_id, organisation_id, party_id, role, is_primary)
    values (tenancy_id, application_row.organisation_id, application_row.applicant_party_id, 'tenant', true);
  end if;
  insert into public.rental_leases(tenancy_id, organisation_id, terms_json, source_application_id, created_by)
  select tenancy_id, application_row.organisation_id, jsonb_build_object('monthly_rent', vacancy.asking_rent, 'deposit_amount', vacancy.deposit_amount, 'lease_term_months', vacancy.lease_term_months, 'intended_occupation_date', occupation_date), application_row.id, auth.uid()
  from public.rental_vacancies vacancy where vacancy.id = application_row.vacancy_id returning id into lease_id;
  perform set_config('app.rental_tenancy_command', 'on', true);
  update public.rental_units set status = 'lease_pending' where id = unit_row.id;

  if application_row.lead_id is not null then
    update public.leads
    set stage = 'Converted to tenancy',
        status = 'Converted to tenancy',
        raw_enquiry_payload = coalesce(raw_enquiry_payload, '{}'::jsonb) || jsonb_build_object(
          'stage', 'converted_to_tenancy',
          'relationships', coalesce(raw_enquiry_payload->'relationships', '{}'::jsonb) || jsonb_build_object(
            'applicationId', application_row.id::text,
            'tenancyId', tenancy_id::text
          )
        ),
        updated_at = now()
    where lead_id = application_row.lead_id and organisation_id = application_row.organisation_id;
  end if;

  return jsonb_build_object('tenancy_id', tenancy_id, 'lease_id', lease_id, 'lead_id', application_row.lead_id, 'idempotent', false, 'tenant_party_reused', application_row.applicant_party_id is not null);
exception when unique_violation then
  select tenancy.id into tenancy_id from public.rental_tenancies tenancy where tenancy.source_application_id = p_application_id;
  if tenancy_id is not null then
    select lease.id into lease_id from public.rental_leases lease where lease.tenancy_id = tenancy_id;
    return jsonb_build_object('tenancy_id', tenancy_id, 'lease_id', lease_id, 'lead_id', application_row.lead_id, 'idempotent', true);
  end if;
  raise;
end; $$;

revoke execute on function public.rental_convert_application_to_tenancy(uuid, integer) from public, anon;
grant execute on function public.rental_convert_application_to_tenancy(uuid, integer) to authenticated;
