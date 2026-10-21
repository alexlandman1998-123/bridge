-- Close reviewed RPC access gaps while retaining guarded application workflows.

BEGIN;

CREATE OR REPLACE FUNCTION private.bridge_assert_pilot_package_authority(p_package_ids jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $guard$
BEGIN
  IF coalesce(auth.role(), '') = 'service_role' THEN RETURN; END IF;
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authenticated pilot operator required.' USING errcode='42501';
  END IF;
  IF coalesce(public.bridge_is_platform_admin(),false) THEN RETURN; END IF;
  IF p_package_ids IS NULL OR jsonb_typeof(p_package_ids) <> 'array' THEN
    RAISE EXCEPTION 'Pilot package authority required.' USING errcode='42501';
  END IF;
  IF jsonb_array_length(p_package_ids)=0 OR EXISTS (
    SELECT 1 FROM jsonb_array_elements_text(p_package_ids) requested(id)
    LEFT JOIN public.transaction_bond_application_export_packages package ON package.id=requested.id::uuid
    LEFT JOIN public.transactions tx ON tx.id=package.transaction_id
    WHERE tx.id IS NULL
      OR NOT coalesce(public.bridge_is_active_member(tx.organisation_id),false)
      OR NOT coalesce(public.bridge_can_access_transaction_spine(tx.id),false)
  ) THEN
    RAISE EXCEPTION 'Pilot package authority required.' USING errcode='42501';
  END IF;
END $guard$;
REVOKE ALL ON FUNCTION private.bridge_assert_pilot_package_authority(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.bridge_assert_pilot_package_authority(jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.bridge_use_partner_prospect_on_transaction(p_transaction_id uuid, p_partner_prospect_id uuid, p_role_type text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_prospect public.partner_prospects%rowtype;
  v_role_type text;
  v_invite_role text;
  v_shape record;
  v_actor uuid := auth.uid();
  v_now timestamptz := now();
  v_access_id uuid;
  v_participant_id uuid;
begin
  -- Authorize before reading a prospect or changing transaction access.
  IF coalesce(auth.role(),'') <> 'service_role' AND (
    auth.uid() IS NULL OR NOT coalesce(public.bridge_can_manage_transaction_role_players(p_transaction_id),false)
  ) THEN RAISE EXCEPTION 'Transaction partner management authority required.' USING errcode='42501'; END IF;
  select *
  into v_prospect
  from public.partner_prospects
  where id = p_partner_prospect_id
  for update;

  if v_prospect.id is null then
    return jsonb_build_object('success', false, 'code', 'prospect_not_found');
  end if;

  v_role_type := coalesce(public.bridge_partner_prospect_role(p_role_type), v_prospect.role_type);
  v_invite_role := case
    when v_role_type = 'attorney' then 'transfer_attorney'
    when v_role_type = 'bond_originator' then 'bond_originator'
    when v_role_type = 'developer' then 'developer'
    else 'other'
  end;

  update public.partner_prospects
  set transaction_count = transaction_count + 1,
      last_transaction_date = v_now,
      updated_at = v_now
  where id = v_prospect.id
  returning * into v_prospect;

  select *
  into v_shape
  from public.bridge_transaction_partner_invite_role_shape(v_invite_role)
  limit 1;

  if v_prospect.status = 'joined' and v_prospect.bridge_user_id is not null then
    insert into public.transaction_user_access (
      transaction_id,
      user_id,
      access_role
    )
    values (
      p_transaction_id,
      v_prospect.bridge_user_id,
      v_invite_role
    )
    on conflict (transaction_id, user_id, access_role) do update
    set updated_at = v_now
    returning id into v_access_id;

    insert into public.transaction_participants (
      transaction_id,
      user_id,
      role_type,
      legal_role,
      transaction_role,
      status,
      participant_name,
      participant_email,
      invited_by_user_id,
      invited_at,
      accepted_at,
      visibility_scope,
      is_internal,
      participant_scope,
      assignment_source,
      partner_prospect_id,
      can_view,
      can_comment,
      can_upload_documents,
      can_edit_finance_workflow,
      can_edit_attorney_workflow,
      can_edit_core_transaction
    )
    values (
      p_transaction_id,
      v_prospect.bridge_user_id,
      v_shape.role_type,
      v_shape.legal_role,
      v_shape.transaction_role,
      'active',
      coalesce(v_prospect.contact_name, v_prospect.company_name),
      v_prospect.email,
      v_actor,
      v_now,
      v_now,
      'shared',
      false,
      'transaction',
      'partner_prospect',
      v_prospect.id,
      true,
      true,
      true,
      v_invite_role = 'bond_originator',
      v_invite_role = 'transfer_attorney',
      false
    )
    on conflict (transaction_id, role_type, legal_role) do update
    set user_id = excluded.user_id,
        status = 'active',
        participant_name = excluded.participant_name,
        participant_email = excluded.participant_email,
        accepted_at = excluded.accepted_at,
        assignment_source = excluded.assignment_source,
        partner_prospect_id = excluded.partner_prospect_id,
        updated_at = v_now
    returning id into v_participant_id;
  end if;

  insert into public.transaction_role_players (
    transaction_id,
    role_type,
    selection_source,
    partner_prospect_id,
    partner_name,
    contact_person,
    email_address,
    phone_number,
    status,
    assignment_status,
    user_id,
    assigned_user_id,
    assigned_by,
    snapshot_json,
    created_at,
    updated_at
  )
  values (
    p_transaction_id,
    v_shape.transaction_role,
    'partner_prospect',
    v_prospect.id,
    v_prospect.company_name,
    v_prospect.contact_name,
    v_prospect.email,
    v_prospect.phone,
    case when v_prospect.bridge_user_id is null then 'pending' else 'active' end,
    case when v_prospect.bridge_user_id is null then 'pending_acceptance' else 'active' end,
    v_prospect.bridge_user_id,
    v_prospect.bridge_user_id,
    v_actor,
    jsonb_build_object(
      'source', 'partner_prospect',
      'partnerProspectId', v_prospect.id,
      'roleType', v_invite_role,
      'prospectStatus', v_prospect.status
    ),
    v_now,
    v_now
  )
  on conflict (transaction_id, role_type) where removed_at is null do update
  set selection_source = excluded.selection_source,
      partner_prospect_id = excluded.partner_prospect_id,
      partner_name = excluded.partner_name,
      contact_person = excluded.contact_person,
      email_address = excluded.email_address,
      phone_number = excluded.phone_number,
      status = excluded.status,
      assignment_status = excluded.assignment_status,
      user_id = excluded.user_id,
      assigned_user_id = excluded.assigned_user_id,
      assigned_by = excluded.assigned_by,
      snapshot_json = excluded.snapshot_json,
      updated_at = v_now;

  perform public.bridge_log_partner_prospect_event(
    v_prospect.id,
    p_transaction_id,
    null,
    'Partner Used Again',
    v_actor,
    jsonb_build_object(
      'roleType', v_invite_role,
      'status', v_prospect.status,
      'accessGranted', v_access_id is not null
    )
  );

  perform public.bridge_log_transaction_partner_invitation_event(
    p_transaction_id,
    'Existing Prospect Reused',
    v_actor,
    jsonb_build_object(
      'partnerProspectId', v_prospect.id,
      'companyName', v_prospect.company_name,
      'roleType', v_invite_role,
      'accessId', v_access_id,
      'participantId', v_participant_id
    )
  );

  return jsonb_build_object(
    'success', true,
    'partnerProspectId', v_prospect.id,
    'accessId', v_access_id,
    'participantId', v_participant_id,
    'accessGranted', v_access_id is not null
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.bridge_upsert_partner_prospect_for_invitation(p_transaction_id uuid, p_invitation_id uuid, p_role_type text, p_company_name text, p_contact_name text DEFAULT NULL::text, p_email text DEFAULT NULL::text, p_phone text DEFAULT NULL::text, p_actor_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_role_type text := public.bridge_partner_prospect_role(p_role_type);
  v_company_name text := nullif(trim(coalesce(p_company_name, '')), '');
  v_company_key text := public.bridge_partner_prospect_key(p_company_name);
  v_email text := nullif(lower(trim(coalesce(p_email, ''))), '');
  v_actor uuid := coalesce(p_actor_user_id, auth.uid());
  v_now timestamptz := now();
  v_existing public.partner_prospects%rowtype;
  v_duplicate_id uuid;
  v_event_type text := 'Prospect Updated';
  v_previous_status text;
begin
  -- Authorize before reading a prospect or changing transaction access.
  IF coalesce(auth.role(),'') <> 'service_role' AND (
    auth.uid() IS NULL OR NOT coalesce(public.bridge_can_manage_transaction_role_players(p_transaction_id),false)
  ) THEN RAISE EXCEPTION 'Transaction partner management authority required.' USING errcode='42501'; END IF;
  IF coalesce(auth.role(),'') <> 'service_role' THEN
    IF p_actor_user_id IS NOT NULL AND p_actor_user_id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'Partner prospect actor must match the authenticated user.' USING errcode='42501';
    END IF;
    IF p_invitation_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.transaction_partner_invitations invitation
      WHERE invitation.id=p_invitation_id AND invitation.transaction_id=p_transaction_id
    ) THEN RAISE EXCEPTION 'Invitation must belong to the authorised transaction.' USING errcode='42501'; END IF;
  END IF;
  if v_company_name is null then
    raise exception 'Partner prospect company name is required.';
  end if;

  if v_company_key is null then
    v_company_key := lower(regexp_replace(v_company_name, '[^a-z0-9]+', '', 'g'));
  end if;

  select *
  into v_existing
  from public.partner_prospects
  where role_type = v_role_type
    and (
      company_key = v_company_key
      or (v_email is not null and email_key = v_email)
    )
  order by
    case when company_key = v_company_key then 0 else 1 end,
    created_at asc
  limit 1
  for update;

  if v_existing.id is null then
    select id
    into v_duplicate_id
    from public.partner_prospects
    where role_type = v_role_type
      and id <> coalesce(v_existing.id, '00000000-0000-0000-0000-000000000000'::uuid)
      and (
        company_key like '%' || v_company_key || '%'
        or v_company_key like '%' || company_key || '%'
      )
    order by created_at asc
    limit 1;

    insert into public.partner_prospects (
      role_type,
      company_name,
      company_key,
      contact_name,
      email,
      email_key,
      phone,
      status,
      first_invited_at,
      last_invited_at,
      last_invitation_date,
      invitation_count,
      transaction_count,
      last_transaction_date,
      possible_duplicate_of,
      duplicate_review_status,
      created_by
    )
    values (
      v_role_type,
      v_company_name,
      v_company_key,
      nullif(trim(coalesce(p_contact_name, '')), ''),
      v_email,
      v_email,
      nullif(trim(coalesce(p_phone, '')), ''),
      'invited',
      v_now,
      v_now,
      v_now,
      1,
      case when p_transaction_id is null then 0 else 1 end,
      case when p_transaction_id is null then null else v_now end,
      v_duplicate_id,
      case when v_duplicate_id is null then 'none' else 'possible_duplicate' end,
      v_actor
    )
    returning * into v_existing;

    v_event_type := 'Prospect Created';
  else
    v_previous_status := v_existing.status;

    update public.partner_prospects
    set contact_name = coalesce(nullif(trim(coalesce(p_contact_name, '')), ''), contact_name),
        email = coalesce(v_email, email),
        email_key = coalesce(v_email, email_key),
        phone = coalesce(nullif(trim(coalesce(p_phone, '')), ''), phone),
        status = case when status in ('inactive', 'declined') then 'invited' else status end,
        first_invited_at = coalesce(first_invited_at, v_now),
        last_invited_at = v_now,
        last_invitation_date = v_now,
        invitation_count = invitation_count + 1,
        transaction_count = transaction_count + case when p_transaction_id is null then 0 else 1 end,
        last_transaction_date = case when p_transaction_id is null then last_transaction_date else v_now end,
        updated_at = v_now
    where id = v_existing.id
    returning * into v_existing;

    v_event_type := case
      when v_previous_status in ('inactive', 'declined') then 'Prospect Reactivated'
      when v_existing.status = 'invited' then 'Invitation Reused'
      else 'Prospect Updated'
    end;
  end if;

  if p_invitation_id is not null then
    update public.transaction_partner_invitations
    set partner_prospect_id = v_existing.id
    where id = p_invitation_id;
  end if;

  perform public.bridge_log_partner_prospect_event(
    v_existing.id,
    p_transaction_id,
    p_invitation_id,
    v_event_type,
    v_actor,
    jsonb_build_object(
      'roleType', p_role_type,
      'prospectRoleType', v_role_type,
      'companyName', v_company_name,
      'email', v_email,
      'invitationCount', v_existing.invitation_count,
      'transactionCount', v_existing.transaction_count
    )
  );

  return jsonb_build_object(
    'success', true,
    'prospect', to_jsonb(v_existing),
    'eventType', v_event_type
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.bridge_start_bond_originator_one_originator_pilot(p_pilot_originator_profile_id uuid, p_readiness_report_id uuid, p_export_package_ids jsonb, p_started_by uuid DEFAULT auth.uid(), p_pilot_originator_name text DEFAULT NULL::text, p_pilot_originator_email_reference text DEFAULT NULL::text, p_support_owner text DEFAULT NULL::text, p_rollback_owner text DEFAULT NULL::text, p_idempotency_key text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  readiness_record public.transaction_bond_originator_internal_readiness_reports%rowtype;
  existing_pilot_id uuid;
  pilot_id uuid;
  package_count integer;
  invalid_package_count integer;
  second_originator_count integer;
begin
  PERFORM private.bridge_assert_pilot_package_authority(p_export_package_ids);
  if auth.role() <> 'service_role' and p_started_by is distinct from auth.uid() then
    raise exception 'Pilot start must use the authenticated internal user';
  end if;

  if p_pilot_originator_profile_id is null and coalesce(trim(p_pilot_originator_email_reference), '') = '' then
    raise exception 'One pilot originator is required';
  end if;

  if p_idempotency_key is not null then
    select id into existing_pilot_id
    from public.transaction_bond_originator_one_originator_pilots
    where idempotency_key = p_idempotency_key
    limit 1;

    if existing_pilot_id is not null then
      return existing_pilot_id;
    end if;
  end if;

  if exists (
    select 1
    from public.transaction_bond_originator_one_originator_pilots pilot
    where pilot.status in ('ready', 'active')
  ) then
    raise exception 'A one-originator pilot is already ready or active';
  end if;

  select * into readiness_record
  from public.transaction_bond_originator_internal_readiness_reports
  where id = p_readiness_report_id;

  if not found or readiness_record.status <> 'ready' then
    raise exception 'A ready R1 internal readiness report is required';
  end if;

  select count(*) into package_count
  from jsonb_array_elements_text(coalesce(p_export_package_ids, '[]'::jsonb));

  if package_count = 0 then
    raise exception 'At least one pilot package is required';
  end if;

  select count(*) into invalid_package_count
  from jsonb_array_elements_text(coalesce(p_export_package_ids, '[]'::jsonb)) package_id
  left join public.transaction_bond_application_export_packages package
    on package.id = package_id::uuid
  where package.id is null
    or package.destination_key <> 'bond_originator_intake'
    or package.status not in ('ready_for_originator', 'accepted_by_originator', 'downloaded')
    or coalesce((package.operational_context_json ->> 'bank_workflow_unchanged')::boolean, true) <> true
    or coalesce((package.operational_context_json ->> 'live_delivery_enabled')::boolean, false) <> false
    or coalesce((package.operational_context_json ->> 'no_automatic_bank_submission')::boolean, true) <> true;

  if invalid_package_count > 0 then
    raise exception 'Every pilot package must be ready for manual originator processing';
  end if;

  select count(distinct assignment.assigned_to_profile_id) into second_originator_count
  from public.transaction_bond_originator_workspace_assignments assignment
  join jsonb_array_elements_text(coalesce(p_export_package_ids, '[]'::jsonb)) package_id
    on assignment.export_package_id = package_id::uuid
  where assignment.status in ('assigned', 'accepted')
    and assignment.assigned_to_profile_id is not null
    and assignment.assigned_to_profile_id is distinct from p_pilot_originator_profile_id;

  if second_originator_count > 0 then
    raise exception 'The R6 pilot supports one active bond originator only';
  end if;

  insert into public.transaction_bond_originator_one_originator_pilots (
    pilot_version,
    status,
    pilot_originator_profile_id,
    pilot_originator_email_reference,
    pilot_originator_name,
    maximum_active_originators,
    readiness_report_id,
    governance_report_id,
    pilot_package_ids_json,
    pilot_controls_json,
    pilot_report_json,
    started_by,
    started_at,
    idempotency_key,
    sensitive_payload_included,
    no_automatic_bank_submission,
    live_delivery_enabled,
    bank_workflow_unchanged,
    offer_workflow_unchanged,
    grant_workflow_unchanged,
    metadata
  )
  values (
    'phase-r6-one-originator-pilot-v1',
    'active',
    p_pilot_originator_profile_id,
    nullif(trim(p_pilot_originator_email_reference), ''),
    nullif(trim(p_pilot_originator_name), ''),
    1,
    p_readiness_report_id,
    readiness_record.governance_report_id,
    coalesce(p_export_package_ids, '[]'::jsonb),
    jsonb_build_object(
      'support_owner', p_support_owner,
      'rollback_owner', p_rollback_owner,
      'maximum_active_originators', 1,
      'manual_download_only', true,
      'no_automatic_bank_submission', true,
      'live_delivery_enabled', false
    ),
    jsonb_build_object(
      'pilotVersion', 'phase-r6-one-originator-pilot-v1',
      'status', 'active',
      'maximumActiveOriginators', 1,
      'arch9FacilitatesOnly', true,
      'originatorProcessesExternally', true,
      'sensitivePayloadIncluded', false,
      'noAutomaticBankSubmission', true,
      'liveDeliveryEnabled', false,
      'bankWorkflowUnchanged', true
    ),
    p_started_by,
    now(),
    p_idempotency_key,
    false,
    true,
    false,
    true,
    true,
    true,
    jsonb_build_object(
      'facilitation_only', true,
      'one_originator_only', true,
      'creates_bank_application', false,
      'bank_workflow_unchanged', true,
      'offer_workflow_unchanged', true,
      'grant_workflow_unchanged', true
    )
  )
  returning id into pilot_id;

  update public.transaction_bond_originator_workspace_assignments assignment
  set one_originator_pilot_id = pilot_id,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'one_originator_pilot_id', pilot_id,
        'phase', 'R6',
        'manual_download_only', true,
        'no_automatic_bank_submission', true,
        'bank_workflow_unchanged', true
      )
  from jsonb_array_elements_text(coalesce(p_export_package_ids, '[]'::jsonb)) package_id
  where assignment.export_package_id = package_id::uuid
    and (
      assignment.assigned_to_profile_id = p_pilot_originator_profile_id
      or auth.role() = 'service_role'
    )
    and assignment.status in ('assigned', 'accepted');

  return pilot_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.bridge_start_bond_originator_multi_originator_rollout(p_hardening_report_id uuid, p_approved_originator_profile_ids jsonb, p_export_package_ids jsonb, p_started_by uuid DEFAULT auth.uid(), p_maximum_active_originators integer DEFAULT 3, p_support_owner text DEFAULT NULL::text, p_escalation_owner text DEFAULT NULL::text, p_rollback_owner text DEFAULT NULL::text, p_idempotency_key text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  hardening_record public.transaction_bond_originator_operational_hardening_reports%rowtype;
  existing_rollout_id uuid;
  rollout_id uuid;
  originator_count integer;
  package_count integer;
  invalid_package_count integer;
  unassigned_package_count integer;
  outside_cohort_count integer;
  safe_maximum integer;
begin
  PERFORM private.bridge_assert_pilot_package_authority(p_export_package_ids);
  if auth.role() <> 'service_role' and p_started_by is distinct from auth.uid() then
    raise exception 'Multi-originator rollout start must use the authenticated internal user';
  end if;

  safe_maximum := least(5, greatest(2, coalesce(p_maximum_active_originators, 3)));

  if p_idempotency_key is not null then
    select id into existing_rollout_id
    from public.transaction_bond_originator_multi_originator_rollouts
    where idempotency_key = p_idempotency_key
    limit 1;

    if existing_rollout_id is not null then
      return existing_rollout_id;
    end if;
  end if;

  if exists (
    select 1
    from public.transaction_bond_originator_multi_originator_rollouts rollout
    where rollout.status in ('ready', 'active')
  ) then
    raise exception 'A multi-originator rollout is already ready or active';
  end if;

  select * into hardening_record
  from public.transaction_bond_originator_operational_hardening_reports
  where id = p_hardening_report_id;

  if not found or hardening_record.status <> 'healthy' then
    raise exception 'A healthy R7 operational hardening report is required';
  end if;

  select count(distinct originator_id::uuid) into originator_count
  from jsonb_array_elements_text(coalesce(p_approved_originator_profile_ids, '[]'::jsonb)) originator_id;

  if originator_count < 2 or originator_count > safe_maximum then
    raise exception 'R8 requires at least two approved originators and no more than the configured maximum_active_originators';
  end if;

  select count(*) into package_count
  from jsonb_array_elements_text(coalesce(p_export_package_ids, '[]'::jsonb));

  if package_count = 0 then
    raise exception 'At least one rollout package is required';
  end if;

  select count(*) into invalid_package_count
  from jsonb_array_elements_text(coalesce(p_export_package_ids, '[]'::jsonb)) package_id
  left join public.transaction_bond_application_export_packages package
    on package.id = package_id::uuid
  where package.id is null
    or package.destination_key <> 'bond_originator_intake'
    or package.status not in ('ready_for_originator', 'accepted_by_originator', 'downloaded')
    or coalesce((package.operational_context_json ->> 'bank_workflow_unchanged')::boolean, true) <> true
    or coalesce((package.operational_context_json ->> 'live_delivery_enabled')::boolean, false) <> false
    or coalesce((package.operational_context_json ->> 'no_automatic_bank_submission')::boolean, true) <> true;

  if invalid_package_count > 0 then
    raise exception 'Every R8 rollout package must be ready for manual originator processing';
  end if;

  select count(*) into unassigned_package_count
  from jsonb_array_elements_text(coalesce(p_export_package_ids, '[]'::jsonb)) package_id
  left join public.transaction_bond_originator_workspace_assignments assignment
    on assignment.export_package_id = package_id::uuid
   and assignment.status in ('assigned', 'accepted')
  where assignment.id is null;

  if unassigned_package_count > 0 then
    raise exception 'Every R8 rollout package must have an active originator workspace assignment';
  end if;

  select count(*) into outside_cohort_count
  from jsonb_array_elements_text(coalesce(p_export_package_ids, '[]'::jsonb)) package_id
  join public.transaction_bond_originator_workspace_assignments assignment
    on assignment.export_package_id = package_id::uuid
   and assignment.status in ('assigned', 'accepted')
  where assignment.assigned_to_profile_id not in (
    select originator_id::uuid
    from jsonb_array_elements_text(coalesce(p_approved_originator_profile_ids, '[]'::jsonb)) originator_id
  );

  if outside_cohort_count > 0 then
    raise exception 'R8 rollout packages must be assigned only to approved cohort originators';
  end if;

  if coalesce(trim(p_support_owner), '') = ''
    or coalesce(trim(p_escalation_owner), '') = ''
    or coalesce(trim(p_rollback_owner), '') = ''
  then
    raise exception 'Support, escalation and rollback owners are required';
  end if;

  insert into public.transaction_bond_originator_multi_originator_rollouts (
    rollout_version,
    status,
    maximum_active_originators,
    hardening_report_id,
    approved_originators_json,
    rollout_package_ids_json,
    rollout_controls_json,
    rollout_report_json,
    started_by,
    started_at,
    idempotency_key,
    sensitive_payload_included,
    no_automatic_bank_submission,
    live_delivery_enabled,
    bank_workflow_unchanged,
    offer_workflow_unchanged,
    grant_workflow_unchanged,
    metadata
  )
  values (
    'phase-r8-multi-originator-rollout-v1',
    'active',
    safe_maximum,
    p_hardening_report_id,
    coalesce(p_approved_originator_profile_ids, '[]'::jsonb),
    coalesce(p_export_package_ids, '[]'::jsonb),
    jsonb_build_object(
      'support_owner', p_support_owner,
      'escalation_owner', p_escalation_owner,
      'rollback_owner', p_rollback_owner,
      'maximum_active_originators', safe_maximum,
      'manual_download_only', true,
      'no_automatic_bank_submission', true,
      'live_delivery_enabled', false
    ),
    jsonb_build_object(
      'rolloutVersion', 'phase-r8-multi-originator-rollout-v1',
      'status', 'active',
      'originatorCount', originator_count,
      'packageCount', package_count,
      'maximumActiveOriginators', safe_maximum,
      'manualDownloadOnly', true,
      'facilitationOnly', true,
      'noAutomaticBankSubmission', true,
      'liveDeliveryEnabled', false,
      'bankWorkflowUnchanged', true,
      'offerWorkflowUnchanged', true,
      'grantWorkflowUnchanged', true
    ),
    p_started_by,
    now(),
    p_idempotency_key,
    false,
    true,
    false,
    true,
    true,
    true,
    jsonb_build_object(
      'phase', 'R8',
      'multi_originator_rollout', true,
      'manual_download_only', true,
      'no_automatic_bank_submission', true,
      'live_delivery_enabled', false,
      'bank_workflow_unchanged', true,
      'offer_workflow_unchanged', true,
      'grant_workflow_unchanged', true
    )
  )
  returning id into rollout_id;

  update public.transaction_bond_originator_workspace_assignments assignment
  set multi_originator_rollout_id = rollout_id,
      metadata = coalesce(assignment.metadata, '{}'::jsonb) || jsonb_build_object(
        'phase_r8_multi_originator_rollout_id', rollout_id,
        'manual_download_only', true,
        'no_automatic_bank_submission', true,
        'live_delivery_enabled', false,
        'bank_workflow_unchanged', true
      )
  where assignment.export_package_id in (
    select package_id::uuid
    from jsonb_array_elements_text(coalesce(p_export_package_ids, '[]'::jsonb)) package_id
  )
    and assignment.status in ('assigned', 'accepted');

  return rollout_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.bridge_pause_bond_originator_one_originator_pilot(p_pilot_id uuid, p_paused_by uuid DEFAULT auth.uid(), p_pause_reason text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  PERFORM private.bridge_assert_pilot_package_authority((SELECT pilot_package_ids_json FROM public.transaction_bond_originator_one_originator_pilots WHERE id=p_pilot_id));
  if auth.role() <> 'service_role' and p_paused_by is distinct from auth.uid() then
    raise exception 'Pilot pause must use the authenticated internal user';
  end if;

  update public.transaction_bond_originator_one_originator_pilots
  set status = 'paused',
      paused_by = p_paused_by,
      paused_at = coalesce(paused_at, now()),
      pause_reason = nullif(trim(p_pause_reason), ''),
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'paused', true,
        'future_assignments_paused', true,
        'preserve_audit_history', true,
        'bank_workflow_unchanged', true
      )
  where id = p_pilot_id
    and status in ('ready', 'active');

  if not found then
    raise exception 'Active one-originator pilot not found';
  end if;

  return p_pilot_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.bridge_pause_bond_originator_multi_originator_rollout(p_rollout_id uuid, p_paused_by uuid DEFAULT auth.uid(), p_pause_reason text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  paused_rollout_id uuid;
begin
  PERFORM private.bridge_assert_pilot_package_authority((SELECT rollout_package_ids_json FROM public.transaction_bond_originator_multi_originator_rollouts WHERE id=p_rollout_id));
  if auth.role() <> 'service_role' and p_paused_by is distinct from auth.uid() then
    raise exception 'Multi-originator rollout pause must use the authenticated internal user';
  end if;

  update public.transaction_bond_originator_multi_originator_rollouts
  set status = 'paused',
      paused_by = p_paused_by,
      paused_at = now(),
      pause_reason = nullif(trim(p_pause_reason), ''),
      metadata = metadata || jsonb_build_object(
        'paused_without_bank_workflow_mutation', true,
        'future_assignments_only', true
      )
  where id = p_rollout_id
    and status in ('ready', 'active')
  returning id into paused_rollout_id;

  if paused_rollout_id is null then
    raise exception 'Active or ready multi-originator rollout not found';
  end if;

  return paused_rollout_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.bridge_create_bond_originator_formal_integration_readiness(p_multi_originator_rollout_id uuid, p_destination_key text, p_destination_label text, p_recipient_profile_key text, p_adapter_version text, p_contract_evidence_json jsonb, p_readiness_report_json jsonb, p_created_by uuid DEFAULT auth.uid(), p_idempotency_key text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  rollout_record public.transaction_bond_originator_multi_originator_rollouts%rowtype;
  existing_integration_id uuid;
  integration_id uuid;
  missing_required text[];
begin
  PERFORM private.bridge_assert_pilot_package_authority((SELECT rollout_package_ids_json FROM public.transaction_bond_originator_multi_originator_rollouts WHERE id=p_multi_originator_rollout_id));
  if auth.role() <> 'service_role' and p_created_by is distinct from auth.uid() then
    raise exception 'Formal integration readiness must use the authenticated internal user';
  end if;

  select * into rollout_record
  from public.transaction_bond_originator_multi_originator_rollouts
  where id = p_multi_originator_rollout_id;

  if not found or rollout_record.status not in ('ready', 'active', 'completed') then
    raise exception 'A controlled R8 multi-originator rollout is required before optional formal integration readiness';
  end if;

  if nullif(trim(p_destination_key), '') is null then
    raise exception 'Formal integration destination key is required';
  end if;

  if p_idempotency_key is not null then
    select id into existing_integration_id
    from public.transaction_bond_originator_formal_integrations
    where destination_key = trim(p_destination_key)
      and idempotency_key = p_idempotency_key
    limit 1;

    if existing_integration_id is not null then
      return existing_integration_id;
    end if;
  end if;

  select array_agg(required_key) into missing_required
  from unnest(array[
    'approvedSchema',
    'enumMap',
    'validationRules',
    'transportPolicy',
    'credentialPolicy',
    'acknowledgementContract',
    'statusContract',
    'securityReview',
    'dataProcessingApproval',
    'sandboxTestPlan'
  ]) required_key
  where coalesce((p_contract_evidence_json ->> required_key)::boolean, false) <> true;

  insert into public.transaction_bond_originator_formal_integrations (
    formal_integration_version,
    status,
    multi_originator_rollout_id,
    destination_key,
    destination_label,
    recipient_profile_key,
    adapter_version,
    contract_evidence_json,
    readiness_report_json,
    activation_plan_json,
    idempotency_key,
    sandbox_only,
    production_live_delivery_enabled,
    sensitive_payload_included,
    raw_schema_stored,
    credentials_stored,
    no_automatic_bank_submission,
    live_delivery_enabled,
    bank_workflow_unchanged,
    offer_workflow_unchanged,
    grant_workflow_unchanged,
    created_by,
    metadata
  )
  values (
    'phase-r9-optional-formal-integrations-v1',
    case when coalesce(array_length(missing_required, 1), 0) = 0 then 'ready_for_sandbox' else 'blocked' end,
    p_multi_originator_rollout_id,
    trim(p_destination_key),
    nullif(trim(p_destination_label), ''),
    nullif(trim(p_recipient_profile_key), ''),
    nullif(trim(p_adapter_version), ''),
    coalesce(p_contract_evidence_json, '{}'::jsonb) - 'schemaJson' - 'credentials' - 'credentialValue' - 'payloadExample',
    coalesce(p_readiness_report_json, '{}'::jsonb) || jsonb_build_object(
      'formalIntegrationVersion', 'phase-r9-optional-formal-integrations-v1',
      'sandboxOnly', true,
      'productionLiveDelivery', false,
      'noAutomaticBankSubmission', true,
      'liveDeliveryEnabled', false,
      'bankWorkflowUnchanged', true
    ),
    '{}'::jsonb,
    p_idempotency_key,
    true,
    false,
    false,
    false,
    false,
    true,
    false,
    true,
    true,
    true,
    p_created_by,
    jsonb_build_object(
      'phase', 'R9',
      'optional_formal_integration', true,
      'missing_required_evidence', coalesce(to_jsonb(missing_required), '[]'::jsonb),
      'sandbox_only', true,
      'production_live_delivery_enabled', false,
      'no_automatic_bank_submission', true,
      'live_delivery_enabled', false,
      'bank_workflow_unchanged', true,
      'offer_workflow_unchanged', true,
      'grant_workflow_unchanged', true
    )
  )
  returning id into integration_id;

  return integration_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.bridge_activate_bond_originator_formal_integration_sandbox(p_formal_integration_id uuid, p_activated_by uuid DEFAULT auth.uid())
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  activated_integration_id uuid;
begin
  PERFORM private.bridge_assert_pilot_package_authority((SELECT rollout.rollout_package_ids_json FROM public.transaction_bond_originator_formal_integrations integration JOIN public.transaction_bond_originator_multi_originator_rollouts rollout ON rollout.id=integration.multi_originator_rollout_id WHERE integration.id=p_formal_integration_id));
  if auth.role() <> 'service_role' and p_activated_by is distinct from auth.uid() then
    raise exception 'Formal integration sandbox activation must use the authenticated internal user';
  end if;

  update public.transaction_bond_originator_formal_integrations
  set status = 'sandbox_active',
      sandbox_activated_by = p_activated_by,
      sandbox_activated_at = now(),
      activation_plan_json = activation_plan_json || jsonb_build_object(
        'mode', 'sandbox_only',
        'production_live_delivery_enabled', false,
        'no_automatic_bank_submission', true,
        'live_delivery_enabled', false,
        'bank_workflow_unchanged', true
      )
  where id = p_formal_integration_id
    and status = 'ready_for_sandbox'
  returning id into activated_integration_id;

  if activated_integration_id is null then
    raise exception 'Formal integration must be ready_for_sandbox before sandbox activation';
  end if;

  return activated_integration_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.bridge_record_bond_originator_operational_incident(p_pilot_id uuid, p_severity text, p_title text, p_summary text, p_export_package_id uuid DEFAULT NULL::uuid, p_detected_by uuid DEFAULT auth.uid(), p_idempotency_key text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  pilot_record public.transaction_bond_originator_one_originator_pilots%rowtype;
  existing_incident_id uuid;
  incident_id uuid;
begin
  PERFORM private.bridge_assert_pilot_package_authority((SELECT pilot_package_ids_json FROM public.transaction_bond_originator_one_originator_pilots WHERE id=p_pilot_id));
  IF coalesce(auth.role(),'') <> 'service_role' AND p_detected_by IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Pilot actor must match the authenticated user.' USING errcode='42501'; END IF;
  select * into pilot_record
  from public.transaction_bond_originator_one_originator_pilots
  where id = p_pilot_id;

  if not found then
    raise exception 'R7 operational hardening incident requires an existing one-originator pilot';
  end if;

  if auth.role() <> 'service_role'
    and p_detected_by is distinct from auth.uid()
    and auth.uid() is distinct from pilot_record.pilot_originator_profile_id
    and not exists (
      select 1
      from public.transaction_bond_originator_workspace_assignments assignment
      where assignment.one_originator_pilot_id = p_pilot_id
        and public.bridge_can_access_transaction_spine(assignment.transaction_id)
    )
  then
    raise exception 'Not authorized to record operational incident for this pilot';
  end if;

  if p_severity not in ('low', 'medium', 'high', 'critical') then
    raise exception 'Invalid operational incident severity';
  end if;

  if nullif(trim(p_title), '') is null or nullif(trim(p_summary), '') is null then
    raise exception 'Operational incident title and summary are required';
  end if;

  if p_idempotency_key is not null then
    select id into existing_incident_id
    from public.transaction_bond_originator_operational_incidents
    where pilot_id = p_pilot_id
      and idempotency_key = p_idempotency_key
    limit 1;

    if existing_incident_id is not null then
      return existing_incident_id;
    end if;
  end if;

  if p_export_package_id is not null and not exists (
    select 1
    from public.transaction_bond_originator_workspace_assignments assignment
    where assignment.one_originator_pilot_id = p_pilot_id
      and assignment.export_package_id = p_export_package_id
  ) then
    raise exception 'Operational incident package must belong to this pilot';
  end if;

  insert into public.transaction_bond_originator_operational_incidents (
    pilot_id,
    export_package_id,
    hardening_version,
    severity,
    status,
    title,
    summary,
    detected_by,
    detected_at,
    idempotency_key,
    sensitive_payload_included,
    no_automatic_bank_submission,
    live_delivery_enabled,
    bank_workflow_unchanged,
    offer_workflow_unchanged,
    grant_workflow_unchanged,
    metadata
  )
  values (
    p_pilot_id,
    p_export_package_id,
    'phase-r7-operational-hardening-v1',
    p_severity,
    'open',
    trim(p_title),
    trim(p_summary),
    p_detected_by,
    now(),
    p_idempotency_key,
    false,
    true,
    false,
    true,
    true,
    true,
    jsonb_build_object(
      'phase', 'R7',
      'operational_hardening', true,
      'facilitation_only', true,
      'no_automatic_bank_submission', true,
      'live_delivery_enabled', false,
      'bank_workflow_unchanged', true,
      'offer_workflow_unchanged', true,
      'grant_workflow_unchanged', true
    )
  )
  returning id into incident_id;

  return incident_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.bridge_create_bond_originator_operational_hardening_report(p_pilot_id uuid, p_status text, p_hardening_report_json jsonb DEFAULT '{}'::jsonb, p_checklist_json jsonb DEFAULT '[]'::jsonb, p_generated_by uuid DEFAULT auth.uid(), p_idempotency_key text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  pilot_record public.transaction_bond_originator_one_originator_pilots%rowtype;
  existing_report_id uuid;
  report_id uuid;
  open_severe_incident_count integer;
begin
  PERFORM private.bridge_assert_pilot_package_authority((SELECT pilot_package_ids_json FROM public.transaction_bond_originator_one_originator_pilots WHERE id=p_pilot_id));
  IF coalesce(auth.role(),'') <> 'service_role' AND p_generated_by IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Pilot actor must match the authenticated user.' USING errcode='42501'; END IF;
  select * into pilot_record
  from public.transaction_bond_originator_one_originator_pilots
  where id = p_pilot_id;

  if not found then
    raise exception 'R7 operational hardening report requires an existing one-originator pilot';
  end if;

  if auth.role() <> 'service_role'
    and p_generated_by is distinct from auth.uid()
    and auth.uid() is distinct from pilot_record.pilot_originator_profile_id
    and not exists (
      select 1
      from public.transaction_bond_originator_workspace_assignments assignment
      where assignment.one_originator_pilot_id = p_pilot_id
        and public.bridge_can_access_transaction_spine(assignment.transaction_id)
    )
  then
    raise exception 'Not authorized to create operational hardening report for this pilot';
  end if;

  if p_status not in ('healthy', 'attention_required', 'blocked') then
    raise exception 'Invalid operational hardening status';
  end if;

  if p_idempotency_key is not null then
    select id into existing_report_id
    from public.transaction_bond_originator_operational_hardening_reports
    where pilot_id = p_pilot_id
      and idempotency_key = p_idempotency_key
    limit 1;

    if existing_report_id is not null then
      return existing_report_id;
    end if;
  end if;

  select count(*) into open_severe_incident_count
  from public.transaction_bond_originator_operational_incidents incident
  where incident.pilot_id = p_pilot_id
    and incident.status in ('open', 'investigating')
    and incident.severity in ('high', 'critical');

  if p_status = 'healthy' and open_severe_incident_count > 0 then
    raise exception 'Operational hardening cannot be healthy while high-severity incidents are open';
  end if;

  insert into public.transaction_bond_originator_operational_hardening_reports (
    pilot_id,
    report_version,
    status,
    hardening_report_json,
    checklist_json,
    incident_summary_json,
    generated_by,
    generated_at,
    idempotency_key,
    sensitive_payload_included,
    no_automatic_bank_submission,
    live_delivery_enabled,
    bank_workflow_unchanged,
    offer_workflow_unchanged,
    grant_workflow_unchanged,
    metadata
  )
  values (
    p_pilot_id,
    'phase-r7-operational-hardening-v1',
    p_status,
    coalesce(p_hardening_report_json, '{}'::jsonb) || jsonb_build_object(
      'phase', 'R7',
      'hardeningVersion', 'phase-r7-operational-hardening-v1',
      'maximumActiveOriginators', 1,
      'facilitationOnly', true,
      'noAutomaticBankSubmission', true,
      'liveDeliveryEnabled', false,
      'bankWorkflowUnchanged', true,
      'offerWorkflowUnchanged', true,
      'grantWorkflowUnchanged', true
    ),
    coalesce(p_checklist_json, '[]'::jsonb),
    jsonb_build_object(
      'openSevereIncidentCount', open_severe_incident_count,
      'sensitivePayloadIncluded', false
    ),
    p_generated_by,
    now(),
    p_idempotency_key,
    false,
    true,
    false,
    true,
    true,
    true,
    jsonb_build_object(
      'reporting_only', true,
      'maximum_active_originators', 1,
      'no_automatic_bank_submission', true,
      'live_delivery_enabled', false,
      'bank_workflow_unchanged', true,
      'offer_workflow_unchanged', true,
      'grant_workflow_unchanged', true
    )
  )
  returning id into report_id;

  return report_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.bridge_can_manage_transaction_role_players(target_transaction_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(
    auth.uid() is not null
    and (
      exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and lower(coalesce(p.role, '')) in ('developer', 'internal_admin', 'admin', 'super_admin')
      )
      or exists (
        select 1
        from public.transactions t
        where t.id = target_transaction_id
          and (
            t.owner_user_id = auth.uid()
            or nullif(lower(trim(t.assigned_agent_email)), '') = nullif(lower(trim(auth.jwt() ->> 'email')), '')
            or nullif(lower(trim(t.assigned_attorney_email)), '') = nullif(lower(trim(auth.jwt() ->> 'email')), '')
            or nullif(lower(trim(t.assigned_bond_originator_email)), '') = nullif(lower(trim(auth.jwt() ->> 'email')), '')
          )
      )
      or exists (
        select 1
        from public.transaction_participants tp
        where tp.transaction_id = target_transaction_id
          and coalesce(tp.status, 'active') = 'active'
          and tp.removed_at is null
          and (
            tp.user_id = auth.uid()
            or nullif(lower(trim(tp.participant_email)), '') = nullif(lower(trim(auth.jwt() ->> 'email')), '')
          )
      )
    ),
    false
  );
$function$
;

CREATE OR REPLACE FUNCTION public.bridge_lookup_referral_invite_by_token(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  invite_row public.referral_invites%rowtype;
  referral_row public.lead_referrals%rowtype;
  client_row public.referral_clients%rowtype;
  agreement_row public.referral_agreements%rowtype;
begin
  select *
    into invite_row
  from public.referral_invites
  where token = nullif(trim(p_token), '')
  limit 1;

  if invite_row.id is null then
    return jsonb_build_object('success', false, 'code', 'not_found');
  end if;

  -- An expired or revoked bearer must not disclose client or commission data.
  IF invite_row.status IN ('revoked','cancelled','expired') THEN
    RETURN jsonb_build_object('success',false,'code',invite_row.status);
  END IF;
  IF invite_row.expires_at IS NOT NULL AND invite_row.expires_at <= now() THEN
    RETURN jsonb_build_object('success',false,'code','expired');
  END IF;

  select *
    into referral_row
  from public.lead_referrals
  where id = invite_row.referral_id
  limit 1;

  if referral_row.id is null then
    return jsonb_build_object('success', false, 'code', 'not_found');
  end if;

  if invite_row.expires_at is not null and invite_row.expires_at < now() and invite_row.status in ('pending', 'sent') then
    update public.referral_invites
      set status = 'expired',
          updated_at = now()
    where id = invite_row.id
    returning * into invite_row;
  end if;

  select *
    into client_row
  from public.referral_clients
  where referral_id = referral_row.id
  order by created_at asc
  limit 1;

  select *
    into agreement_row
  from public.referral_agreements
  where referral_id = referral_row.id
  order by version desc
  limit 1;

  return jsonb_build_object(
    'success', true,
    'invite', jsonb_build_object(
      'id', invite_row.id,
      'referral_id', invite_row.referral_id,
      'token', invite_row.token,
      'email', invite_row.email,
      'status', invite_row.status,
      'expires_at', invite_row.expires_at,
      'first_sent_at', invite_row.first_sent_at,
      'last_sent_at', invite_row.last_sent_at,
      'accepted_at', invite_row.accepted_at,
      'accepted_by_user_id', invite_row.accepted_by_user_id,
      'declined_at', invite_row.declined_at,
      'declined_by_user_id', invite_row.declined_by_user_id,
      'decline_reason', invite_row.decline_reason,
      'metadata', invite_row.metadata,
      'created_at', invite_row.created_at,
      'updated_at', invite_row.updated_at
    ),
    'referral', jsonb_build_object(
      'id', referral_row.id,
      'source_organisation_id', referral_row.source_organisation_id,
      'source_lead_id', referral_row.source_lead_id,
      'source_lead_type', referral_row.source_lead_type,
      'referral_type', referral_row.referral_type,
      'related_listing_id', referral_row.related_listing_id,
      'source_branch_id', referral_row.source_branch_id,
      'source_agent_id', referral_row.source_agent_id,
      'source_agent_name', referral_row.source_agent_name,
      'source_agent_email', referral_row.source_agent_email,
      'target_organisation_id', referral_row.target_organisation_id,
      'target_branch_id', referral_row.target_branch_id,
      'target_agent_id', referral_row.target_agent_id,
      'target_agent_name', referral_row.target_agent_name,
      'target_agent_email', referral_row.target_agent_email,
      'target_company_name', referral_row.target_company_name,
      'recipient_scope', referral_row.recipient_scope,
      'status', referral_row.status,
      'commission_split_percentage', referral_row.commission_split_percentage,
      'commission_split_basis', referral_row.commission_split_basis,
      'agreement_status', referral_row.agreement_status,
      'agreement_text', referral_row.agreement_text,
      'protection_period_days', referral_row.protection_period_days,
      'accepted_at', referral_row.accepted_at,
      'accepted_by_user_id', referral_row.accepted_by_user_id,
      'accepted_by_email', referral_row.accepted_by_email,
      'declined_at', referral_row.declined_at,
      'declined_by_user_id', referral_row.declined_by_user_id,
      'declined_by_email', referral_row.declined_by_email,
      'decline_reason', referral_row.decline_reason,
      'agreement_locked_at', referral_row.agreement_locked_at,
      'invite_token', referral_row.invite_token,
      'invite_expires_at', referral_row.invite_expires_at,
      'notes', referral_row.notes,
      'created_at', referral_row.created_at,
      'updated_at', referral_row.updated_at
    ),
    'client', case
      when client_row.id is null then null
      else jsonb_build_object(
        'id', client_row.id,
        'referral_id', client_row.referral_id,
        'source_organisation_id', client_row.source_organisation_id,
        'source_lead_id', client_row.source_lead_id,
        'client_type', client_row.client_type,
        'client_name', client_row.client_name,
        'client_email', client_row.client_email,
        'client_phone', client_row.client_phone,
        'client_context', client_row.client_context,
        'client_status', client_row.client_status,
        'metadata', client_row.metadata,
        'created_at', client_row.created_at,
        'updated_at', client_row.updated_at
      )
    end,
    'agreement', case
      when agreement_row.id is null then null
      else jsonb_build_object(
        'id', agreement_row.id,
        'referral_id', agreement_row.referral_id,
        'version', agreement_row.version,
        'status', agreement_row.status,
        'commission_split_percentage', agreement_row.commission_split_percentage,
        'commission_split_basis', agreement_row.commission_split_basis,
        'agreement_text', agreement_row.agreement_text,
        'protection_period_days', agreement_row.protection_period_days,
        'sent_at', agreement_row.sent_at,
        'accepted_at', agreement_row.accepted_at,
        'accepted_by_user_id', agreement_row.accepted_by_user_id,
        'accepted_by_email', agreement_row.accepted_by_email,
        'declined_at', agreement_row.declined_at,
        'declined_by_user_id', agreement_row.declined_by_user_id,
        'declined_by_email', agreement_row.declined_by_email,
        'decline_reason', agreement_row.decline_reason,
        'locked_at', agreement_row.locked_at,
        'created_by', agreement_row.created_by,
        'created_at', agreement_row.created_at,
        'updated_at', agreement_row.updated_at
      )
    end
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.bridge_lookup_invite_by_token(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_token text := nullif(trim(coalesce(p_token, '')), '');
  v_invite public.invites%rowtype;
  v_workspace jsonb := null;
begin
  if v_token is null then
    return jsonb_build_object('success', false, 'code', 'missing_token');
  end if;

  select *
  into v_invite
  from public.invites
  where token = v_token;

  if v_invite.id is null then
    return jsonb_build_object('success', false, 'code', 'not_found');
  end if;

  IF v_invite.revoked_at IS NOT NULL OR v_invite.status IN ('revoked','cancelled','expired') THEN
    RETURN jsonb_build_object('success',false,'code','invite_unavailable');
  END IF;
  IF v_invite.expires_at IS NOT NULL AND v_invite.expires_at <= now() THEN
    RETURN jsonb_build_object('success',false,'code','expired');
  END IF;

  if v_invite.target_workspace_id is not null then
    select jsonb_build_object(
      'id', o.id,
      'name', o.name,
      'display_name', o.display_name,
      'type', o.type,
      'logo_url', o.logo_url
    )
    into v_workspace
    from public.organisations o
    where o.id = v_invite.target_workspace_id;
  end if;

  return jsonb_build_object(
    'success', true,
    'invite', jsonb_build_object(
      'id', v_invite.id,
      'invite_type', v_invite.invite_type,
      'status', v_invite.status,
      'token', v_invite.token,
      'expires_at', v_invite.expires_at,
      'inviter_user_id', v_invite.inviter_user_id,
      'target_workspace_id', v_invite.target_workspace_id,
      'target_workspace_role', v_invite.target_workspace_role,
      'target_transaction_id', v_invite.target_transaction_id,
      'target_transaction_role', v_invite.target_transaction_role,
      'target_branch_id', v_invite.target_branch_id,
      'target_team_id', v_invite.target_team_id,
      'email', v_invite.email,
      'phone', v_invite.phone,
      'invitee_user_id', v_invite.invitee_user_id,
      'metadata', coalesce(v_invite.metadata, '{}'::jsonb),
      'accepted_at', v_invite.accepted_at,
      'accepted_by_user_id', v_invite.accepted_by_user_id,
      'revoked_at', v_invite.revoked_at,
      'revoked_by_user_id', v_invite.revoked_by_user_id,
      'created_at', v_invite.created_at,
      'updated_at', v_invite.updated_at,
      'organisations', v_workspace
    )
  );
end;
$function$
;

DO $acl$
DECLARE f record;
BEGIN
  FOR f IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname=ANY(ARRAY[
      'bridge_record_invite_event',
      'bridge_sync_commission_allocation_review_sources',
      'bridge_sync_seller_portal_transaction_context',
      'bridge_phase6_enqueue_transaction',
      'bridge_phase6_get_or_create_queue',
      'canonical_document_rls_grants_audit',
      'apply_attorney_matter_number_backfill',
      'bridge_assigned_bond_compliance_user_id',
      'bridge_assigned_bond_manager_user_id',
      'bridge_assigned_bond_processor_user_id',
      'bridge_bond_region_id',
      'bridge_bond_workspace_id',
      'bridge_bond_workspace_unit_id',
      'bridge_primary_bond_consultant_user_id'
    ])
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.signature);
  END LOOP;
END $acl$;

DO $acl$
DECLARE f record;
BEGIN
  FOR f IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname=ANY(ARRAY[
      'bridge_accept_bond_originator_workspace_package',
      'bridge_activate_bond_originator_formal_integration_sandbox',
      'bridge_bond_originator_workspace_mvp_view',
      'bridge_capture_bond_originator_workspace_bank_offer',
      'bridge_capture_bond_originator_workspace_grant',
      'bridge_create_bond_originator_formal_integration_readiness',
      'bridge_create_bond_originator_workspace_document_request',
      'bridge_originator_document_request_queue_view',
      'bridge_originator_offer_grant_capture_workspace_view',
      'bridge_originator_progress_workspace_view',
      'bridge_pause_bond_originator_multi_originator_rollout',
      'bridge_pause_bond_originator_one_originator_pilot',
      'bridge_publish_bond_originator_workspace_bank_offer',
      'bridge_publish_bond_originator_workspace_grant',
      'bridge_record_bond_originator_workspace_progress_update',
      'bridge_start_bond_originator_multi_originator_rollout',
      'bridge_start_bond_originator_one_originator_pilot',
      'bridge_upsert_partner_prospect_for_invitation',
      'bridge_use_partner_prospect_on_transaction',
      'bridge_ensure_attorney_firm_organisation',
      'bridge_reconcile_attorney_firm_organisation',
      'bridge_record_bond_originator_operational_incident',
      'bridge_create_bond_originator_operational_hardening_report',
      'bridge_bond_originator_one_originator_pilot_view',
      'bridge_bond_originator_operational_hardening_view'
    ])
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon',f.signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated,service_role',f.signature);
  END LOOP;
END $acl$;

COMMIT;
