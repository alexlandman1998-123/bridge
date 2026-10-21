-- Staff closeout must authorize the caller before recording any event.
DO $guard$ BEGIN IF md5(pg_get_functiondef('public.bridge_closeout_transaction_with_commission_check(uuid,text,text,boolean,text)'::regprocedure)) <> '8c2682588a9babd0ba5bf1af0da700e0' THEN RAISE EXCEPTION 'Closeout function changed since security review'; END IF; END $guard$;

CREATE OR REPLACE FUNCTION public.bridge_closeout_transaction_with_commission_check(p_transaction_id uuid, p_stage text DEFAULT 'Registered'::text, p_lifecycle_state text DEFAULT 'completed'::text, p_override boolean DEFAULT false, p_override_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  tx_row public.transactions%rowtype;
  updated_tx_row public.transactions%rowtype;
  v_validation jsonb;
  v_reason text := nullif(trim(coalesce(p_override_reason, '')), '');
  v_actor_id uuid := auth.uid();
  v_actor_email text := public.bridge_current_email();
  v_action text;
begin
  if auth.uid() is null and coalesce(auth.role(), '') <> 'service_role' then
    return jsonb_build_object('success', false, 'code', 'forbidden');
  end if;
  if p_transaction_id is null then
    return jsonb_build_object('success', false, 'code', 'transaction_id_required');
  end if;

  select *
    into tx_row
  from public.transactions
  where id = p_transaction_id
  for update;

  if tx_row.id is null then
    return jsonb_build_object('success', false, 'code', 'transaction_not_found');
  end if;

  -- Authorize before either blocked-attempt events or successful closeout writes.
  if coalesce(auth.role(), '') <> 'service_role'
     and not public.bridge_is_active_member(tx_row.organisation_id)
     and not public.bridge_is_org_admin(tx_row.organisation_id) then
    return jsonb_build_object('success', false, 'code', 'forbidden');
  end if;

  if not public.bridge_is_transaction_closeout_state(p_stage, p_stage, p_lifecycle_state) then
    return jsonb_build_object('success', false, 'code', 'invalid_closeout_state');
  end if;

  if p_override and v_reason is null then
    return jsonb_build_object('success', false, 'code', 'override_reason_required');
  end if;

  v_validation := public.bridge_validate_transaction_commission_closeout(p_transaction_id, p_override);

  if coalesce((v_validation->>'success')::boolean, false) = false then
    insert into public.commission_closeout_events (
      transaction_id,
      organisation_id,
      action,
      from_stage,
      to_stage,
      from_current_main_stage,
      to_current_main_stage,
      from_lifecycle_state,
      to_lifecycle_state,
      active_allocation_count,
      unresolved_allocation_count,
      unresolved_amount,
      reason,
      actor_id,
      actor_email,
      metadata
    )
    values (
      tx_row.id,
      tx_row.organisation_id,
      'blocked',
      tx_row.stage,
      p_stage,
      tx_row.current_main_stage,
      p_stage,
      tx_row.lifecycle_state,
      p_lifecycle_state,
      coalesce((v_validation->>'active_allocation_count')::integer, 0),
      coalesce((v_validation->>'unresolved_allocation_count')::integer, 0),
      coalesce((v_validation->>'unresolved_amount')::numeric, 0),
      coalesce(v_reason, v_validation->>'code'),
      v_actor_id,
      v_actor_email,
      jsonb_build_object('validation', v_validation)
    );

    return v_validation;
  end if;

  v_action := case
    when p_override and coalesce((v_validation->>'unresolved_allocation_count')::integer, 0) > 0 then 'override_closed_out'
    else 'closed_out'
  end;

  if v_action = 'override_closed_out' then
    perform set_config('bridge.commission_closeout_override_transaction_id', p_transaction_id::text, true);
  end if;

  update public.transactions
    set stage = p_stage,
        current_main_stage = p_stage,
        lifecycle_state = p_lifecycle_state,
        updated_at = now()
  where id = p_transaction_id
  returning * into updated_tx_row;

  insert into public.commission_closeout_events (
    transaction_id,
    organisation_id,
    action,
    from_stage,
    to_stage,
    from_current_main_stage,
    to_current_main_stage,
    from_lifecycle_state,
    to_lifecycle_state,
    active_allocation_count,
    unresolved_allocation_count,
    unresolved_amount,
    reason,
    actor_id,
    actor_email,
    metadata
  )
  values (
    updated_tx_row.id,
    updated_tx_row.organisation_id,
    v_action,
    tx_row.stage,
    updated_tx_row.stage,
    tx_row.current_main_stage,
    updated_tx_row.current_main_stage,
    tx_row.lifecycle_state,
    updated_tx_row.lifecycle_state,
    coalesce((v_validation->>'active_allocation_count')::integer, 0),
    coalesce((v_validation->>'unresolved_allocation_count')::integer, 0),
    coalesce((v_validation->>'unresolved_amount')::numeric, 0),
    v_reason,
    v_actor_id,
    v_actor_email,
    jsonb_build_object(
      'validation', v_validation,
      'override', p_override,
      'requested_stage', p_stage,
      'requested_lifecycle_state', p_lifecycle_state
    )
  );

  return jsonb_build_object(
    'success', true,
    'code', v_action,
    'transaction_id', updated_tx_row.id,
    'organisation_id', updated_tx_row.organisation_id,
    'stage', updated_tx_row.stage,
    'current_main_stage', updated_tx_row.current_main_stage,
    'lifecycle_state', updated_tx_row.lifecycle_state,
    'validation', v_validation
  );
end;
$function$
;

REVOKE EXECUTE ON FUNCTION public.bridge_closeout_transaction_with_commission_check(p_transaction_id uuid, p_stage text, p_lifecycle_state text, p_override boolean, p_override_reason text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bridge_closeout_transaction_with_commission_check(p_transaction_id uuid, p_stage text, p_lifecycle_state text, p_override boolean, p_override_reason text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.bridge_phase3_remove_member(p_membership_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bridge_phase3_remove_member(p_membership_id uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.bridge_phase3_update_member_role(p_membership_id uuid, p_organization_role text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bridge_phase3_update_member_role(p_membership_id uuid, p_organization_role text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.bridge_review_bond_wet_ink(p_upload uuid, p_action text, p_feedback text, p_checks jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bridge_review_bond_wet_ink(p_upload uuid, p_action text, p_feedback text, p_checks jsonb) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.bridge_update_attorney_organisation_identity_v3(target_firm_id uuid, identity_patch jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bridge_update_attorney_organisation_identity_v3(target_firm_id uuid, identity_patch jsonb) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.email_campaign_cancel(p_campaign_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.email_campaign_cancel(p_campaign_id uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.email_campaign_prepare_dispatch(p_campaign_id uuid, p_send_at timestamp with time zone) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.email_campaign_prepare_dispatch(p_campaign_id uuid, p_send_at timestamp with time zone) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.bridge_notification_observability_snapshot_phase9(p_organisation_id uuid, p_since timestamp with time zone) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bridge_notification_observability_snapshot_phase9(p_organisation_id uuid, p_since timestamp with time zone) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.bridge_notification_release_readiness_phase10(p_organisation_id uuid, p_since timestamp with time zone) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bridge_notification_release_readiness_phase10(p_organisation_id uuid, p_since timestamp with time zone) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.bridge_private_listing_conversion_timeline(p_private_listing_id uuid, p_lead_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bridge_private_listing_conversion_timeline(p_private_listing_id uuid, p_lead_id uuid) TO authenticated, service_role;
NOTIFY pgrst, 'reload schema';
