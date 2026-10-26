-- Restrict staff follow-up and prospect access without changing public capture.
BEGIN;
-- Exact reviewed RPC definitions must still be present.
DO $review$ BEGIN
IF md5(pg_get_functiondef('public.bridge_upsert_partner_prospect_for_invitation(uuid,uuid,text,text,text,text,text,uuid)'::regprocedure)) <> '234664a077791ec1c64de6fbd440e3f8' THEN RAISE EXCEPTION 'Reviewed partner function changed: bridge_upsert_partner_prospect_for_invitation'; END IF;
IF md5(pg_get_functiondef('public.bridge_use_partner_prospect_on_transaction(uuid,uuid,text)'::regprocedure)) <> '527c0ef44c3cd9f6de4ab1199fe66455' THEN RAISE EXCEPTION 'Reviewed partner function changed: bridge_use_partner_prospect_on_transaction'; END IF;
END $review$;


CREATE OR REPLACE FUNCTION private.arch9_can_read_partner_prospect(p_prospect_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $guard$
 SELECT auth.uid() IS NOT NULL AND EXISTS (
  SELECT 1 FROM public.partner_prospects p WHERE p.id=p_prospect_id AND (
   (public.arch9_admin_access_level()->>'level') IN ('executive','customer_support')
   OR (
    (p.organisation_id IS NOT NULL OR p.organization_id IS NOT NULL)
    AND (p.organisation_id IS NULL OR public.bridge_is_active_member(p.organisation_id))
    AND (p.organization_id IS NULL OR public.bridge_is_active_member(p.organization_id))
   )
   OR (p.organisation_id IS NULL AND p.organization_id IS NULL AND (
    EXISTS (SELECT 1 FROM public.transaction_partner_invitations i
      JOIN public.transactions t ON t.id=i.transaction_id
      WHERE i.partner_prospect_id=p.id AND public.bridge_is_active_member(t.organisation_id)
        AND public.bridge_can_access_transaction_spine(t.id))
    OR EXISTS (SELECT 1 FROM public.partner_prospect_events e
      JOIN public.transactions t ON t.id=e.transaction_id
      WHERE e.partner_prospect_id=p.id AND public.bridge_is_active_member(t.organisation_id)
        AND public.bridge_can_access_transaction_spine(t.id))
    OR (p.created_by=auth.uid()
      AND NOT EXISTS (SELECT 1 FROM public.transaction_partner_invitations i WHERE i.partner_prospect_id=p.id)
      AND NOT EXISTS (SELECT 1 FROM public.partner_prospect_events e WHERE e.partner_prospect_id=p.id))
   ))
  )
 );
$guard$;
REVOKE ALL ON FUNCTION private.arch9_can_read_partner_prospect(uuid) FROM PUBLIC,anon;
GRANT USAGE ON SCHEMA private TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.arch9_can_read_partner_prospect(uuid) TO authenticated,service_role;

DROP POLICY IF EXISTS "Authenticated team can read launch leads" ON public.launch_event_leads;
CREATE POLICY "Authenticated team can read launch leads" ON public.launch_event_leads
 FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL AND (public.arch9_admin_access_level()->>'level') IN ('executive','customer_support'));
DROP POLICY IF EXISTS "Authenticated team can update launch leads" ON public.launch_event_leads;
CREATE POLICY "Authenticated team can update launch leads" ON public.launch_event_leads
 FOR UPDATE TO authenticated
 USING (auth.uid() IS NOT NULL AND (public.arch9_admin_access_level()->>'level')='executive')
 WITH CHECK (auth.uid() IS NOT NULL AND (public.arch9_admin_access_level()->>'level')='executive');
DROP POLICY IF EXISTS "Authenticated team can read referral clicks" ON public.launch_event_referral_clicks;
CREATE POLICY "Authenticated team can read referral clicks" ON public.launch_event_referral_clicks
 FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL AND (public.arch9_admin_access_level()->>'level') IN ('executive','customer_support'));

DROP POLICY IF EXISTS partner_prospects_select_authenticated ON public.partner_prospects;
CREATE POLICY partner_prospects_select_authenticated ON public.partner_prospects
 FOR SELECT TO authenticated USING (private.arch9_can_read_partner_prospect(id));
DROP POLICY IF EXISTS partner_prospect_events_select_authenticated ON public.partner_prospect_events;
CREATE POLICY partner_prospect_events_select_authenticated ON public.partner_prospect_events
 FOR SELECT TO authenticated USING (
  auth.uid() IS NOT NULL AND (
   (public.arch9_admin_access_level()->>'level') IN ('executive','customer_support')
   OR (private.arch9_can_read_partner_prospect(partner_prospect_id)
    AND (transaction_id IS NULL OR public.bridge_can_access_transaction_spine(transaction_id)))
  )
 );
-- Keep the existing restrictive transaction fence on events intact.

DROP POLICY IF EXISTS areas_authenticated_insert ON public.areas;
CREATE POLICY areas_authenticated_insert ON public.areas FOR INSERT TO authenticated
 WITH CHECK (auth.uid() IS NOT NULL AND (public.arch9_admin_access_level()->>'level')='executive');
DROP POLICY IF EXISTS areas_authenticated_update ON public.areas;
CREATE POLICY areas_authenticated_update ON public.areas FOR UPDATE TO authenticated
 USING (auth.uid() IS NOT NULL AND (public.arch9_admin_access_level()->>'level')='executive')
 WITH CHECK (auth.uid() IS NOT NULL AND (public.arch9_admin_access_level()->>'level')='executive');
DROP POLICY IF EXISTS area_aliases_authenticated_insert ON public.area_aliases;
CREATE POLICY area_aliases_authenticated_insert ON public.area_aliases FOR INSERT TO authenticated
 WITH CHECK (auth.uid() IS NOT NULL AND (public.arch9_admin_access_level()->>'level')='executive');
DROP POLICY IF EXISTS area_aliases_authenticated_update ON public.area_aliases;
CREATE POLICY area_aliases_authenticated_update ON public.area_aliases FOR UPDATE TO authenticated
 USING (auth.uid() IS NOT NULL AND (public.arch9_admin_access_level()->>'level')='executive')
 WITH CHECK (auth.uid() IS NOT NULL AND (public.arch9_admin_access_level()->>'level')='executive');
-- Public read policies and bounded public lead/referral INSERT policies are retained.

-- Contacts with the same company must remain separate across organisations.
DROP INDEX IF EXISTS public.partner_prospects_role_company_uidx;
CREATE UNIQUE INDEX IF NOT EXISTS partner_prospects_org_role_company_uidx
 ON public.partner_prospects(coalesce(organisation_id,organization_id),role_type,company_key)
 WHERE coalesce(organisation_id,organization_id) IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS partner_prospects_legacy_owner_role_company_uidx
 ON public.partner_prospects(created_by,role_type,company_key)
 WHERE organisation_id IS NULL AND organization_id IS NULL;
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
  v_prospect_org uuid;
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
  SELECT t.organisation_id INTO v_prospect_org FROM public.transactions t WHERE t.id=p_transaction_id;
  IF coalesce(auth.role(),'') <> 'service_role' AND v_prospect_org IS NULL THEN
    RAISE EXCEPTION 'Transaction organisation required.' USING errcode='42501';
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
    and (coalesce(organisation_id,organization_id) IS NOT DISTINCT FROM v_prospect_org)
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
      and (coalesce(organisation_id,organization_id) IS NOT DISTINCT FROM v_prospect_org)
      and id <> coalesce(v_existing.id, '00000000-0000-0000-0000-000000000000'::uuid)
      and (
        company_key like '%' || v_company_key || '%'
        or v_company_key like '%' || company_key || '%'
      )
    order by created_at asc
    limit 1;

    insert into public.partner_prospects (
      organisation_id,
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
      v_prospect_org,
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
$function$;

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
  v_prospect_org uuid;
  v_access_id uuid;
  v_participant_id uuid;
begin
  -- Authorize before reading a prospect or changing transaction access.
  IF coalesce(auth.role(),'') <> 'service_role' AND (
    auth.uid() IS NULL OR NOT coalesce(public.bridge_can_manage_transaction_role_players(p_transaction_id),false)
  ) THEN RAISE EXCEPTION 'Transaction partner management authority required.' USING errcode='42501'; END IF;
  SELECT t.organisation_id INTO v_prospect_org FROM public.transactions t WHERE t.id=p_transaction_id;
  IF coalesce(auth.role(),'') <> 'service_role' AND v_prospect_org IS NULL THEN
    RAISE EXCEPTION 'Transaction organisation required.' USING errcode='42501';
  END IF;
  select *
  into v_prospect
  from public.partner_prospects
  where id = p_partner_prospect_id
  for update;

  if v_prospect.id is null then
    return jsonb_build_object('success', false, 'code', 'prospect_not_found');
  end if;

  IF coalesce(auth.role(),'') <> 'service_role' AND (
    NOT private.arch9_can_read_partner_prospect(v_prospect.id)
    OR (coalesce(v_prospect.organisation_id,v_prospect.organization_id) IS NOT NULL
      AND coalesce(v_prospect.organisation_id,v_prospect.organization_id) IS DISTINCT FROM v_prospect_org)
  ) THEN RAISE EXCEPTION 'Partner prospect access required.' USING errcode='42501'; END IF;
  v_role_type := coalesce(public.bridge_partner_prospect_role(p_role_type), v_prospect.role_type);
  v_invite_role := case
    when v_role_type = 'attorney' then 'transfer_attorney'
    when v_role_type = 'bond_originator' then 'bond_originator'
    when v_role_type = 'developer' then 'developer'
    else 'other'
  end;

  update public.partner_prospects
  set organisation_id = coalesce(organisation_id,organization_id,v_prospect_org),
      transaction_count = transaction_count + 1,
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
$function$;

COMMIT;
