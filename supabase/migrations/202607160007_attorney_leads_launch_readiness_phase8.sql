begin;

-- Phase 8 exposes a read-only, tenant-scoped launch gate. It deliberately
-- reports aggregate operational health only and never returns contact data,
-- submission metadata, IP hashes, or cross-tenant identifiers.
create or replace function public.bridge_attorney_leads_launch_readiness(
  p_organisation_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_firm public.attorney_firms%rowtype;
  v_link public.public_intake_links%rowtype;
  v_owner_count integer := 0;
  v_open_leads integer := 0;
  v_due_follow_ups integer := 0;
  v_public_submissions_30d integer := 0;
  v_failed_conversions integer := 0;
  v_services_ready boolean := false;
  v_branding_ready boolean := false;
  v_contact_ready boolean := false;
  v_blockers text[] := array[]::text[];
  v_warnings text[] := array[]::text[];
  v_status text := 'ready';
begin
  if auth.uid() is null or not public.bridge_attorney_lead_can_access(
    p_organisation_id, null, null, 'view_link'
  ) then
    raise exception 'Not authorised to view Attorney Leads launch readiness';
  end if;

  select firm.* into v_firm
  from public.attorney_firms firm
  join public.organisations organisation
    on organisation.id = firm.organisation_id
   and organisation.type = 'attorney_firm'
   and organisation.status = 'active'
  where firm.organisation_id = p_organisation_id
    and firm.is_active = true
  order by firm.created_at asc
  limit 1;

  if not found then
    v_blockers := array_append(v_blockers, 'No active Attorney firm is linked to this workspace.');
  else
    select link.* into v_link
    from public.public_intake_links link
    where link.organisation_id = p_organisation_id
      and link.status <> 'archived'
    order by case when link.status = 'active' then 0 else 1 end, link.updated_at desc
    limit 1;

    if not found then
      v_blockers := array_append(v_blockers, 'Create the firm public Journey link.');
    elsif v_link.status <> 'active' or v_link.disabled_at is not null then
      v_blockers := array_append(v_blockers, 'Enable the firm public Journey link.');
    end if;

    v_services_ready := v_link.id is not null
      and jsonb_typeof(v_link.service_config_json) = 'array'
      and v_link.service_config_json ?& array[
        'transfer_quote', 'property_transfer', 'bond_registration',
        'bond_cancellation', 'property_legal_advice', 'general_enquiry'
      ];
    if not v_services_ready then
      v_blockers := array_append(v_blockers, 'Restore all six first-release Attorney services.');
    end if;

    select count(distinct candidate.user_id)::integer into v_owner_count
    from (
      select member.user_id
      from public.attorney_firm_members member
      where member.firm_id = v_firm.id
        and member.status = 'active'
        and member.role in (
          'firm_admin', 'director_partner', 'transfer_attorney', 'bond_attorney'
        )
      union
      select member.user_id
      from public.organisation_users member
      where member.organisation_id = p_organisation_id
        and member.user_id is not null
        and lower(trim(coalesce(member.membership_status, member.status, ''))) in ('active', 'accepted')
        and lower(trim(coalesce(
          nullif(trim(member.organisation_role), ''),
          nullif(trim(member.workspace_role), ''),
          nullif(trim(member.role), ''),
          nullif(trim(member.app_role), ''),
          'viewer'
        ))) in (
          'owner', 'principal', 'partner', 'director', 'firm_admin', 'director_partner',
          'attorney', 'conveyancer', 'transfer_attorney', 'bond_attorney'
        )
    ) candidate;
    if v_owner_count = 0 then
      v_blockers := array_append(v_blockers, 'Add an active Attorney-qualified Lead or Matter owner.');
    end if;

    v_branding_ready := nullif(trim(coalesce(v_firm.logo_url, '')), '') is not null
      and coalesce(v_firm.primary_colour, '') ~ '^#[0-9A-Fa-f]{6}$';
    if not v_branding_ready then
      v_warnings := array_append(v_warnings, 'Complete the firm logo and primary brand colour; safe fallbacks remain available.');
    end if;

    v_contact_ready := nullif(trim(coalesce(v_firm.email, '')), '') is not null
      or nullif(trim(coalesce(v_firm.phone, '')), '') is not null;
    if not v_contact_ready then
      v_warnings := array_append(v_warnings, 'Add a public firm email address or phone number.');
    end if;
  end if;

  select
    count(*) filter (where lead.status = 'open')::integer,
    count(*) filter (
      where lead.status = 'open'
        and lead.next_follow_up_at is not null
        and lead.next_follow_up_at <= now()
    )::integer
  into v_open_leads, v_due_follow_ups
  from public.leads lead
  where lead.organisation_id = p_organisation_id
    and lead.lead_domain = 'attorney';

  select count(*)::integer into v_public_submissions_30d
  from public.public_intake_submissions submission
  where submission.organisation_id = p_organisation_id
    and submission.status in ('processed', 'duplicate')
    and submission.created_at >= now() - interval '30 days';

  select count(*)::integer into v_failed_conversions
  from public.attorney_lead_conversions conversion
  where conversion.organisation_id = p_organisation_id
    and conversion.conversion_status = 'failed';

  if v_failed_conversions > 0 then
    v_warnings := array_append(v_warnings, format('%s failed conversion attempt(s) require review.', v_failed_conversions));
  end if;
  if v_due_follow_ups > 0 then
    v_warnings := array_append(v_warnings, format('%s Lead follow-up(s) are due.', v_due_follow_ups));
  end if;

  if cardinality(v_blockers) > 0 then
    v_status := 'blocked';
  elsif cardinality(v_warnings) > 0 then
    v_status := 'attention';
  end if;

  return jsonb_build_object(
    'status', v_status,
    'checked_at', now(),
    'journey', jsonb_build_object(
      'created', v_link.id is not null,
      'active', v_link.id is not null and v_link.status = 'active' and v_link.disabled_at is null,
      'slug', v_link.slug,
      'services_ready', v_services_ready,
      'branding_ready', v_branding_ready,
      'contact_ready', v_contact_ready
    ),
    'operations', jsonb_build_object(
      'qualified_owner_count', v_owner_count,
      'open_leads', v_open_leads,
      'due_follow_ups', v_due_follow_ups,
      'public_submissions_30d', v_public_submissions_30d,
      'failed_conversions', v_failed_conversions
    ),
    'blockers', to_jsonb(v_blockers),
    'warnings', to_jsonb(v_warnings)
  );
end;
$$;

revoke all on function public.bridge_attorney_leads_launch_readiness(uuid) from public, anon;
grant execute on function public.bridge_attorney_leads_launch_readiness(uuid) to authenticated;

comment on function public.bridge_attorney_leads_launch_readiness(uuid) is
  'Tenant-safe Phase 8 launch gate for the Attorney public Journey and Leads CRM.';

commit;
