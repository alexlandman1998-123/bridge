begin;

-- Phase 3 exposes the minimum lead detail and staff directory required by the
-- CEO workflow drawer. The browser never receives direct table write access.

create or replace function public.arch9_admin_ceo_lead_workflow_v1(
  p_enquiry_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_result jsonb;
begin
  if not public.bridge_is_platform_admin() then
    raise exception 'CEO lead workflow access is required.' using errcode = '42501';
  end if;

  if p_enquiry_id is null then
    raise exception 'A lead id is required.' using errcode = '22023';
  end if;

  select jsonb_build_object(
    'version', 1,
    'lead', jsonb_build_object(
      'id', enquiry.id,
      'organisationType', enquiry.role,
      'organisationName', enquiry.company,
      'contactName', trim(concat_ws(' ', enquiry.first_name, enquiry.last_name)),
      'email', enquiry.email,
      'phone', enquiry.phone,
      'businessSize', enquiry.business_size,
      'monthlyVolume', enquiry.monthly_volume,
      'source', enquiry.source,
      'priority', enquiry.priority,
      'stage', enquiry.sales_stage,
      'assignedToUserId', enquiry.assigned_to_user_id,
      'nextAction', enquiry.next_action,
      'nextActionAt', enquiry.next_action_at,
      'lostReason', enquiry.lost_reason,
      'convertedOrganisationId', enquiry.converted_organisation_id,
      'internalNotes', enquiry.internal_notes,
      'submittedAt', coalesce(enquiry.submitted_at, enquiry.created_at),
      'updatedAt', enquiry.updated_at
    ),
    'assignees', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', staff.id,
        'name', coalesce(nullif(trim(staff.full_name), ''), nullif(trim(concat_ws(' ', staff.first_name, staff.last_name)), ''), staff.email),
        'email', staff.email,
        'role', coalesce(nullif(staff.system_role, ''), nullif(staff.department, ''), staff.role)
      ) order by coalesce(nullif(trim(staff.full_name), ''), staff.email))
      from public.profiles staff
      where staff.id = auth.uid()
        or lower(coalesce(staff.system_role, '')) in (
          'platform_admin', 'super_admin', 'internal_admin', 'executive',
          'executive_level', 'founder', 'hq_staff', 'manager', 'sales',
          'sales_manager', 'support_agent', 'customer_support'
        )
        or lower(coalesce(staff.department, '')) in (
          'sales', 'customer support', 'support', 'operations', 'management'
        )
    ), '[]'::jsonb)
  )
  into v_result
  from public.demo_enquiries enquiry
  where enquiry.id = p_enquiry_id;

  if v_result is null then
    raise exception 'Lead not found.' using errcode = 'P0002';
  end if;

  return v_result;
end;
$$;

revoke all on function public.arch9_admin_ceo_lead_workflow_v1(uuid) from public, anon, authenticated, service_role;
grant execute on function public.arch9_admin_ceo_lead_workflow_v1(uuid) to authenticated;

commit;
