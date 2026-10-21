-- Public intake may create an enquiry, but cannot take over an existing contact.
-- Staff-only RPCs already require login; remove unnecessary anonymous execution.
-- Policy helpers and token/session-authorized client/offer/seller portals remain unchanged.
DO $guard$ BEGIN
 IF md5(pg_get_functiondef('public.submit_arch9_inbound_lead(jsonb,text)'::regprocedure)) <> '3c13004755a8588212f01f5fdd24458c' THEN RAISE EXCEPTION 'Inbound intake changed since security review'; END IF;
END $guard$;

CREATE OR REPLACE FUNCTION public.submit_arch9_inbound_lead(p_payload jsonb, p_idempotency_key text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_existing_submission public.inbound_lead_submissions%rowtype;
  v_lead public.inbound_leads%rowtype;
  v_lead_id uuid;
  v_first_name text := nullif(trim(coalesce(p_payload ->> 'first_name', '')), '');
  v_last_name text := nullif(trim(coalesce(p_payload ->> 'last_name', '')), '');
  v_email text := lower(trim(coalesce(p_payload ->> 'email', '')));
  v_mobile text := nullif(trim(coalesce(p_payload ->> 'mobile', '')), '');
  v_mobile_digits text := regexp_replace(coalesce(p_payload ->> 'mobile', ''), '[^0-9]+', '', 'g');
  v_role_type text := lower(trim(coalesce(p_payload ->> 'role_type', '')));
  v_position text := nullif(trim(coalesce(p_payload ->> 'position', '')), '');
  v_organisation_name text := nullif(trim(coalesce(p_payload ->> 'organisation_name', '')), '');
  v_website text := nullif(trim(coalesce(p_payload ->> 'website', '')), '');
  v_location text := nullif(trim(coalesce(p_payload ->> 'location', '')), '');
  v_business_metrics jsonb := coalesce(p_payload -> 'business_metrics', '{}'::jsonb);
  v_interests text[] := public.arch9_inbound_text_array(coalesce(p_payload -> 'selected_interests', '[]'::jsonb));
  v_services text[] := public.arch9_inbound_text_array(coalesce(p_payload -> 'services', '[]'::jsonb));
  v_source text;
  v_duplicate boolean := false;
  v_now timestamptz := now();
begin
  if jsonb_typeof(p_payload) <> 'object' or octet_length(p_payload::text) > 65536 then
    raise exception 'Invalid inbound lead payload';
  end if;

  if p_idempotency_key is not null
    and (char_length(p_idempotency_key) not between 12 and 128 or p_idempotency_key !~ '^[A-Za-z0-9._:-]+$') then
    raise exception 'Invalid idempotency key';
  end if;

  if p_idempotency_key is not null then
    select *
      into v_existing_submission
    from public.inbound_lead_submissions
    where idempotency_key = p_idempotency_key
    limit 1;

    if found then
      return jsonb_build_object('accepted', true, 'duplicate', true, 'lead_id', v_existing_submission.inbound_lead_id);
    end if;
  end if;

  if v_role_type = 'estate_agency' then v_role_type := 'agency'; end if;
  if v_role_type = 'bond originator' then v_role_type := 'bond_originator'; end if;

  if v_first_name is null or char_length(v_first_name) > 120 then
    raise exception 'First name is required';
  end if;
  if v_last_name is null or char_length(v_last_name) > 120 then
    raise exception 'Last name is required';
  end if;
  if v_email = '' or char_length(v_email) > 254 or v_email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'A valid work email is required';
  end if;
  if v_mobile is null or v_mobile_digits !~ '^(0[6-8][0-9]{8}|27[6-8][0-9]{8}|[6-8][0-9]{8})$' then
    raise exception 'A valid South African mobile number is required';
  end if;
  if v_role_type not in ('developer', 'agency', 'bond_originator', 'attorney') then
    raise exception 'A valid role is required';
  end if;
  if v_organisation_name is null or char_length(v_organisation_name) > 180 then
    raise exception 'Organisation name is required';
  end if;
  if jsonb_typeof(v_business_metrics) <> 'object' or octet_length(v_business_metrics::text) > 32768 then
    raise exception 'Invalid business metrics';
  end if;

  v_source := public.arch9_inbound_source(
    coalesce(p_payload ->> 'utm_source', p_payload ->> 'source'),
    p_payload ->> 'utm_medium',
    p_payload ->> 'referrer'
  );

  perform pg_advisory_xact_lock(hashtextextended(v_email || ':' || v_mobile_digits || ':' || lower(v_organisation_name), 0));

  select *
    into v_lead
  from public.inbound_leads lead
  where lower(trim(lead.email)) = v_email
     or regexp_replace(lead.mobile, '[^0-9]+', '', 'g') = v_mobile_digits
     or lower(trim(lead.organisation_name)) = lower(trim(v_organisation_name))
  order by
    case when lower(trim(email)) = v_email then 0 else 1 end,
    case when regexp_replace(mobile, '[^0-9]+', '', 'g') = v_mobile_digits then 0 else 1 end,
    created_at desc
  limit 1;

  if found then
    v_duplicate := true;
    v_lead_id := v_lead.id;

    -- An unauthenticated enquiry is not proof of ownership of a matching
    -- contact. Preserve the authoritative identity and contact fields; the
    -- full new submission is stored below for staff review.
    update public.inbound_leads
    set duplicate_count = duplicate_count + 1,
        last_submission_at = v_now
    where id = v_lead_id;

    perform public.arch9_inbound_activity(
      v_lead_id,
      'repeat_submission',
      'Repeat inbound submission received; saved contact details preserved for staff review.',
      jsonb_build_object('source', v_source, 'idempotency_key', p_idempotency_key)
    );
  else
    insert into public.inbound_leads (
      first_name,
      last_name,
      email,
      mobile,
      role_type,
      position,
      organisation_name,
      website,
      location,
      business_metrics,
      selected_interests,
      services,
      source,
      utm_source,
      utm_medium,
      utm_campaign,
      utm_content,
      referrer,
      landing_url,
      source_payload,
      last_submission_at,
      created_by,
      updated_by
    )
    values (
      v_first_name,
      v_last_name,
      v_email,
      v_mobile,
      v_role_type,
      v_position,
      v_organisation_name,
      v_website,
      v_location,
      v_business_metrics,
      v_interests,
      v_services,
      v_source,
      nullif(trim(coalesce(p_payload ->> 'utm_source', '')), ''),
      nullif(trim(coalesce(p_payload ->> 'utm_medium', '')), ''),
      nullif(trim(coalesce(p_payload ->> 'utm_campaign', '')), ''),
      nullif(trim(coalesce(p_payload ->> 'utm_content', '')), ''),
      nullif(trim(coalesce(p_payload ->> 'referrer', '')), ''),
      nullif(trim(coalesce(p_payload ->> 'landing_url', '')), ''),
      p_payload,
      v_now,
      auth.uid(),
      auth.uid()
    )
    returning id into v_lead_id;

    perform public.arch9_inbound_activity(
      v_lead_id,
      'created',
      'Inbound lead created from public intake.',
      jsonb_build_object('source', v_source, 'campaign', nullif(trim(coalesce(p_payload ->> 'utm_campaign', '')), ''))
    );
  end if;

  insert into public.inbound_lead_submissions (
    inbound_lead_id,
    idempotency_key,
    source,
    utm_source,
    utm_medium,
    utm_campaign,
    utm_content,
    referrer,
    landing_url,
    payload_json
  )
  values (
    v_lead_id,
    p_idempotency_key,
    v_source,
    nullif(trim(coalesce(p_payload ->> 'utm_source', '')), ''),
    nullif(trim(coalesce(p_payload ->> 'utm_medium', '')), ''),
    nullif(trim(coalesce(p_payload ->> 'utm_campaign', '')), ''),
    nullif(trim(coalesce(p_payload ->> 'utm_content', '')), ''),
    nullif(trim(coalesce(p_payload ->> 'referrer', '')), ''),
    nullif(trim(coalesce(p_payload ->> 'landing_url', '')), ''),
    p_payload
  )
  on conflict (idempotency_key) where (idempotency_key is not null) do nothing;

  return jsonb_build_object('accepted', true, 'duplicate', v_duplicate, 'lead_id', v_lead_id);
end;
$function$
;

REVOKE EXECUTE ON FUNCTION public.attorney_firm_module_accepts_new_work(p_firm_id uuid, p_module_key text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.attorney_firm_module_accepts_new_work(p_firm_id uuid, p_module_key text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.attorney_matter_reference_is_available(p_attorney_firm_id uuid, p_reference text, p_exclude_matter_file_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.attorney_matter_reference_is_available(p_attorney_firm_id uuid, p_reference text, p_exclude_matter_file_id uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.bridge_complete_workspace_onboarding_v3(payload jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bridge_complete_workspace_onboarding_v3(payload jsonb) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.bridge_organisation_ownership_health(p_organisation_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bridge_organisation_ownership_health(p_organisation_id uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.bridge_remove_organisation_partner(p_organisation_id uuid, p_partner_role_configuration_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bridge_remove_organisation_partner(p_organisation_id uuid, p_partner_role_configuration_id uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.bridge_review_bond_originator_workspace_document_request(p_request_id uuid, p_action text, p_buyer_safe_feedback text, p_internal_note text, p_originator_profile_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bridge_review_bond_originator_workspace_document_request(p_request_id uuid, p_action text, p_buyer_safe_feedback text, p_internal_note text, p_originator_profile_id uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.bridge_revoke_developer_document_portal_link(p_link_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bridge_revoke_developer_document_portal_link(p_link_id uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.bridge_save_organisation_partner(p_organisation_id uuid, p_partner_role_configuration_id uuid, p_external_partner_id uuid, p_partner_organisation_id uuid, p_role_type text, p_company_name text, p_contact_person text, p_email_address text, p_phone_number text, p_website text, p_physical_address text, p_province text, p_notes text, p_is_active boolean, p_is_preferred_default boolean, p_source text, p_scope_type text, p_scope_json jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bridge_save_organisation_partner(p_organisation_id uuid, p_partner_role_configuration_id uuid, p_external_partner_id uuid, p_partner_organisation_id uuid, p_role_type text, p_company_name text, p_contact_person text, p_email_address text, p_phone_number text, p_website text, p_physical_address text, p_province text, p_notes text, p_is_active boolean, p_is_preferred_default boolean, p_source text, p_scope_type text, p_scope_json jsonb) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.bridge_set_notification_recipient_preference_phase4(p_organisation_id uuid, p_recipient_email text, p_email_enabled boolean, p_whatsapp_enabled boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bridge_set_notification_recipient_preference_phase4(p_organisation_id uuid, p_recipient_email text, p_email_enabled boolean, p_whatsapp_enabled boolean) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.bridge_transaction_progress_notification_health_phase4(p_organisation_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bridge_transaction_progress_notification_health_phase4(p_organisation_id uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.bridge_upsert_organisation_partner_role(p_organisation_id uuid, p_role_id uuid, p_relationship_id uuid, p_external_partner_id uuid, p_role_type text, p_is_active boolean, p_is_preferred_default boolean, p_source text, p_scope_type text, p_scope_json jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bridge_upsert_organisation_partner_role(p_organisation_id uuid, p_role_id uuid, p_relationship_id uuid, p_external_partner_id uuid, p_role_type text, p_is_active boolean, p_is_preferred_default boolean, p_source text, p_scope_type text, p_scope_json jsonb) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.clear_attorney_matter_filing_reference(p_attorney_matter_file_id uuid, p_change_reason text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clear_attorney_matter_filing_reference(p_attorney_matter_file_id uuid, p_change_reason text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.ensure_attorney_matter_file(p_transaction_id uuid, p_attorney_firm_id uuid, p_lane text, p_reference_date date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_attorney_matter_file(p_transaction_id uuid, p_attorney_firm_id uuid, p_lane text, p_reference_date date) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.get_attorney_firm_module_history(p_firm_id uuid, p_limit integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_attorney_firm_module_history(p_firm_id uuid, p_limit integer) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.get_attorney_firm_module_lifecycle_assurance(p_firm_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_attorney_firm_module_lifecycle_assurance(p_firm_id uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.get_attorney_firm_module_overview(p_firm_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_attorney_firm_module_overview(p_firm_id uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.get_attorney_firm_modules(p_firm_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_attorney_firm_modules(p_firm_id uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.get_attorney_matter_reference_index(p_attorney_firm_id uuid, p_transaction_ids uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_attorney_matter_reference_index(p_attorney_firm_id uuid, p_transaction_ids uuid[]) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.resolve_attorney_matter_reference(p_transaction_id uuid, p_attorney_firm_id uuid, p_lane text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_attorney_matter_reference(p_transaction_id uuid, p_attorney_firm_id uuid, p_lane text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.save_attorney_matter_number_settings(p_attorney_firm_id uuid, p_settings jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_attorney_matter_number_settings(p_attorney_firm_id uuid, p_settings jsonb) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.set_attorney_firm_module_status(p_firm_id uuid, p_module_key text, p_status text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_attorney_firm_module_status(p_firm_id uuid, p_module_key text, p_status text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.set_attorney_matter_filing_reference(p_attorney_matter_file_id uuid, p_filing_reference text, p_change_reason text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_attorney_matter_filing_reference(p_attorney_matter_file_id uuid, p_filing_reference text, p_change_reason text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
