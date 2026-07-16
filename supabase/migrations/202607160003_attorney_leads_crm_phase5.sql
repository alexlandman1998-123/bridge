begin;

create or replace function public.bridge_create_attorney_lead(
  p_organisation_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_branch_id uuid;
  v_assigned_user_id uuid;
  v_contact_id uuid;
  v_lead_id uuid;
  v_service_type text;
  v_source_channel text;
  v_campaign_code text;
  v_first_name text;
  v_last_name text;
  v_email text;
  v_phone text;
  v_phone_digits text;
  v_party_role text;
  v_priority text;
  v_property_value numeric;
  v_message text;
  v_now timestamptz := now();
begin
  if auth.uid() is null or p_organisation_id is null then
    raise exception 'Attorney workspace membership is required';
  end if;

  if jsonb_typeof(p_payload) <> 'object' or octet_length(p_payload::text) > 32768 then
    raise exception 'Invalid Attorney Lead payload';
  end if;

  select
    lower(trim(coalesce(
      nullif(trim(member.organisation_role), ''),
      nullif(trim(member.workspace_role), ''),
      nullif(trim(member.role), ''),
      'viewer'
    ))),
    coalesce(member.primary_branch_id, member.branch_id)
  into v_role, v_branch_id
  from public.organisation_users member
  where member.organisation_id = p_organisation_id
    and (
      member.user_id = auth.uid()
      or (
        member.user_id is null
        and nullif(lower(trim(member.email)), '') = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
      )
    )
    and lower(trim(coalesce(member.membership_status, member.status, ''))) in ('active', 'accepted')
  order by case when member.user_id = auth.uid() then 0 else 1 end, member.updated_at desc nulls last
  limit 1;

  if v_role in ('paralegal', 'conveyancing_secretary') then
    v_assigned_user_id := auth.uid();
  end if;

  if not public.bridge_attorney_lead_can_access(
    p_organisation_id,
    v_assigned_user_id,
    v_branch_id,
    'create'
  ) then
    raise exception 'Not authorised to create an Attorney Lead';
  end if;

  v_service_type := lower(trim(coalesce(p_payload ->> 'service_type', '')));
  if v_service_type not in (
    'transfer_quote', 'property_transfer', 'bond_registration',
    'bond_cancellation', 'property_legal_advice', 'general_enquiry'
  ) then
    raise exception 'Invalid Attorney Lead service type';
  end if;

  v_source_channel := lower(trim(coalesce(p_payload ->> 'source_channel', 'manual')));
  if v_source_channel not in (
    'instagram', 'facebook', 'linkedin', 'website', 'whatsapp',
    'email', 'qr', 'referral', 'manual', 'other'
  ) then
    v_source_channel := 'other';
  end if;

  v_campaign_code := nullif(lower(trim(p_payload ->> 'campaign_code')), '');
  if v_campaign_code is not null
    and (char_length(v_campaign_code) > 80 or v_campaign_code !~ '^[a-z0-9][a-z0-9._-]*$') then
    raise exception 'Invalid Attorney Lead campaign code';
  end if;

  v_first_name := nullif(trim(p_payload ->> 'first_name'), '');
  v_last_name := nullif(trim(p_payload ->> 'last_name'), '');
  v_email := nullif(lower(trim(p_payload ->> 'email')), '');
  v_phone := nullif(trim(p_payload ->> 'phone'), '');
  v_phone_digits := nullif(regexp_replace(coalesce(v_phone, ''), '[^0-9]+', '', 'g'), '');
  v_message := nullif(trim(p_payload ->> 'message'), '');

  if v_first_name is null or char_length(v_first_name) > 120
    or char_length(coalesce(v_last_name, '')) > 120 then
    raise exception 'Invalid Attorney Lead contact name';
  end if;
  if v_email is null and v_phone_digits is null then
    raise exception 'Attorney Lead email or phone is required';
  end if;
  if v_email is not null and (char_length(v_email) > 254 or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$') then
    raise exception 'Invalid Attorney Lead email';
  end if;
  if v_phone_digits is not null and char_length(v_phone_digits) not between 7 and 20 then
    raise exception 'Invalid Attorney Lead phone';
  end if;
  if char_length(coalesce(v_message, '')) > 5000 then
    raise exception 'Attorney Lead message is too long';
  end if;

  v_party_role := lower(trim(coalesce(p_payload ->> 'party_role', 'unknown')));
  if v_party_role not in ('buyer', 'seller', 'other', 'unknown') then
    v_party_role := 'unknown';
  end if;

  v_priority := initcap(lower(trim(coalesce(p_payload ->> 'priority', 'Medium'))));
  if v_priority not in ('Low', 'Medium', 'High', 'Urgent') then
    v_priority := 'Medium';
  end if;

  if char_length(coalesce(p_payload ->> 'property_address', '')) > 1000 then
    raise exception 'Attorney Lead property address is too long';
  end if;
  if nullif(trim(p_payload ->> 'property_value'), '') is not null then
    if trim(p_payload ->> 'property_value') !~ '^[0-9]+([.][0-9]{1,2})?$' then
      raise exception 'Invalid Attorney Lead property value';
    end if;
    v_property_value := trim(p_payload ->> 'property_value')::numeric;
    if v_property_value > 1000000000000000 then
      raise exception 'Attorney Lead property value is too large';
    end if;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'attorney-manual-contact:' || p_organisation_id::text || ':' || coalesce(v_email, '') || ':' || coalesce(v_phone_digits, ''),
      0
    )
  );

  select contact.contact_id into v_contact_id
  from public.contacts contact
  where contact.organisation_id = p_organisation_id
    and (
      (v_email is not null and lower(trim(contact.email)) = v_email)
      or (
        v_phone_digits is not null
        and regexp_replace(coalesce(contact.phone, ''), '[^0-9]+', '', 'g') = v_phone_digits
      )
    )
  order by
    case when v_email is not null and lower(trim(contact.email)) = v_email then 0 else 1 end,
    contact.updated_at desc nulls last,
    contact.created_at desc
  limit 1;

  if v_contact_id is null then
    insert into public.contacts (
      organisation_id, assigned_agent_id, first_name, last_name, email, phone, contact_type
    ) values (
      p_organisation_id, v_assigned_user_id, v_first_name, v_last_name, v_email, v_phone, 'other'
    )
    returning contact_id into v_contact_id;
  end if;

  insert into public.leads (
    organisation_id, branch_id, assigned_user_id, contact_id, lead_domain,
    lead_category, lead_direction, lead_source, source_channel, campaign_code,
    stage, status, priority, ownership_status, notes, created_by
  ) values (
    p_organisation_id, v_branch_id, v_assigned_user_id, v_contact_id, 'attorney',
    'other', 'Inbound', initcap(replace(v_source_channel, '_', ' ')), v_source_channel, v_campaign_code,
    'new', 'open', v_priority,
    case when v_assigned_user_id is null then 'awaiting_assignment' else 'assigned' end,
    v_message, auth.uid()
  )
  returning lead_id into v_lead_id;

  insert into public.attorney_lead_details (
    lead_id, organisation_id, service_type, property_address, property_value,
    party_role, enquiry_message, privacy_consent, metadata_json
  ) values (
    v_lead_id,
    p_organisation_id,
    v_service_type,
    nullif(trim(p_payload ->> 'property_address'), ''),
    v_property_value,
    v_party_role,
    v_message,
    false,
    jsonb_build_object('capture_method', 'manual', 'created_by', auth.uid())
  );

  insert into public.lead_activities (
    organisation_id, lead_id, agent_id, activity_type, activity_note, activity_date, outcome
  ) values (
    p_organisation_id, v_lead_id, auth.uid(), 'Lead Created',
    'Attorney Lead captured manually', v_now, 'New'
  );

  return jsonb_build_object('success', true, 'lead_id', v_lead_id);
end;
$$;

revoke all on function public.bridge_create_attorney_lead(uuid, jsonb) from public, anon;
grant execute on function public.bridge_create_attorney_lead(uuid, jsonb) to authenticated;

create or replace function public.bridge_update_attorney_lead_lifecycle(
  p_organisation_id uuid,
  p_lead_id uuid,
  p_stage text,
  p_lost_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead public.leads%rowtype;
  v_stage text := lower(trim(coalesce(p_stage, '')));
  v_status text;
  v_now timestamptz := now();
begin
  select * into v_lead
  from public.leads lead
  where lead.lead_id = p_lead_id
    and lead.organisation_id = p_organisation_id
    and lead.lead_domain = 'attorney'
  for update;

  if not found then
    raise exception 'Attorney Lead not found';
  end if;

  if not public.bridge_attorney_lead_can_access(
    v_lead.organisation_id, v_lead.assigned_user_id, v_lead.branch_id, 'edit'
  ) then
    raise exception 'Not authorised to update this Attorney Lead';
  end if;

  if v_stage not in ('new', 'contacted', 'qualified', 'quote_sent', 'follow_up', 'won', 'lost') then
    raise exception 'Invalid Attorney Lead stage';
  end if;

  v_status := case
    when v_stage = 'won' then 'won'
    when v_stage = 'lost' then 'lost'
    else 'open'
  end;

  if v_stage = 'lost' and nullif(trim(coalesce(p_lost_reason, '')), '') is null then
    raise exception 'A lost reason is required';
  end if;
  if char_length(coalesce(p_lost_reason, '')) > 1000 then
    raise exception 'Lost reason is too long';
  end if;

  update public.leads
  set stage = v_stage,
      status = v_status,
      lost_reason = case when v_stage = 'lost' then trim(p_lost_reason) else null end,
      closed_at = case when v_stage in ('won', 'lost') then v_now else null end,
      last_contacted_at = case
        when v_stage in ('contacted', 'qualified', 'quote_sent', 'follow_up', 'won', 'lost')
          then coalesce(last_contacted_at, v_now)
        else last_contacted_at
      end,
      updated_at = v_now
  where lead_id = p_lead_id
    and organisation_id = p_organisation_id;

  if v_lead.stage is distinct from v_stage then
    insert into public.lead_activities (
      organisation_id, lead_id, agent_id, activity_type, activity_note, activity_date, outcome
    ) values (
      p_organisation_id,
      p_lead_id,
      auth.uid(),
      'Stage Changed',
      'Lead stage changed from ' || coalesce(v_lead.stage, 'unknown') || ' to ' || v_stage,
      v_now,
      initcap(replace(v_stage, '_', ' '))
    );
  end if;

  return jsonb_build_object(
    'success', true,
    'lead_id', p_lead_id,
    'stage', v_stage,
    'status', v_status
  );
end;
$$;

revoke all on function public.bridge_update_attorney_lead_lifecycle(uuid, uuid, text, text) from public, anon;
grant execute on function public.bridge_update_attorney_lead_lifecycle(uuid, uuid, text, text) to authenticated;

create or replace function public.bridge_ensure_attorney_public_intake_link(p_organisation_id uuid)
returns table (
  id uuid,
  slug text,
  status text,
  heading text,
  introduction text,
  service_config_json jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_firm public.attorney_firms%rowtype;
  v_slug text;
begin
  if not public.bridge_attorney_lead_can_access(p_organisation_id, null, null, 'manage_link') then
    raise exception 'Not authorised to manage the Attorney public intake link';
  end if;

  return query
  select link.id, link.slug, link.status, link.heading, link.introduction, link.service_config_json
  from public.public_intake_links link
  where link.organisation_id = p_organisation_id
    and link.status <> 'archived'
  order by case when link.status = 'active' then 0 else 1 end, link.updated_at desc
  limit 1;
  if found then
    return;
  end if;

  select firm.* into v_firm
  from public.attorney_firms firm
  where firm.organisation_id = p_organisation_id
    and firm.is_active = true
  order by firm.created_at asc
  limit 1;

  if not found then
    raise exception 'Active Attorney firm not found';
  end if;

  v_slug := lower(regexp_replace(trim(v_firm.name), '[^a-zA-Z0-9]+', '-', 'g'));
  v_slug := trim(both '-' from v_slug);
  if char_length(v_slug) < 3 then
    v_slug := 'legal-journey';
  end if;
  v_slug := left(v_slug, 70);

  if exists (select 1 from public.public_intake_links existing where lower(existing.slug) = lower(v_slug)) then
    v_slug := left(v_slug, 63) || '-' || substring(md5(v_firm.id::text), 1, 6);
  end if;

  insert into public.public_intake_links (
    organisation_id,
    attorney_firm_id,
    slug,
    status,
    heading,
    introduction,
    created_by
  ) values (
    p_organisation_id,
    v_firm.id,
    v_slug,
    'active',
    'How can we assist you?',
    'Choose a service and tell us briefly how we can help.',
    auth.uid()
  );

  return query
  select link.id, link.slug, link.status, link.heading, link.introduction, link.service_config_json
  from public.public_intake_links link
  where link.organisation_id = p_organisation_id
    and link.slug = v_slug
  limit 1;
end;
$$;

revoke all on function public.bridge_ensure_attorney_public_intake_link(uuid) from public, anon;
grant execute on function public.bridge_ensure_attorney_public_intake_link(uuid) to authenticated;

comment on function public.bridge_create_attorney_lead(uuid, jsonb) is
  'Authenticated atomic manual Attorney Lead capture with exact tenant-scoped contact matching.';
comment on function public.bridge_update_attorney_lead_lifecycle(uuid, uuid, text, text) is
  'Authenticated atomic Attorney Lead lifecycle transition with audit activity.';
comment on function public.bridge_ensure_attorney_public_intake_link(uuid) is
  'Leadership-only command returning or creating the canonical organisation-level Attorney Journey link.';

commit;
