-- Production RPC access boundary: preserve token APIs and policy helpers.

BEGIN;

-- User-editable metadata must never authorize an administrator.

CREATE OR REPLACE FUNCTION public.arch9_admin_invited_users_summary(p_start timestamp with time zone DEFAULT (now() - '30 days'::interval), p_end timestamp with time zone DEFAULT now())
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_claim_role text := lower(coalesce(
    auth.jwt()->'app_metadata'->>'role',
    ''
  ));
  v_profile_role text;
  v_start timestamptz := coalesce(p_start, now() - interval '30 days');
  v_end timestamptz := coalesce(p_end, now());
  v_previous_start timestamptz;
begin
  if v_user_id is null then
    raise exception 'Admin access is required.';
  end if;

  select lower(coalesce(p.system_role, p.role, ''))
    into v_profile_role
  from public.profiles p
  where p.id = v_user_id;

  if coalesce(v_claim_role, '') not in (
      'executive',
      'executive_level',
      'founder',
      'super_admin',
      'platform_admin',
      'internal_admin',
      'developer',
      'hq_staff',
      'admin'
    )
    and coalesce(v_profile_role, '') not in (
      'executive',
      'executive_level',
      'founder',
      'super_admin',
      'platform_admin',
      'internal_admin',
      'developer',
      'hq_staff',
      'admin'
    ) then
    raise exception 'Admin access is required.';
  end if;

  if v_start > v_end then
    v_start := v_end - interval '30 days';
  end if;

  v_previous_start := v_start - (v_end - v_start);

  return (
    with invite_rows as (
      select
        coalesce(nullif(lower(trim(email)), ''), invitee_user_id::text, id::text) as identity,
        coalesce(nullif(target_workspace_role, ''), nullif(target_transaction_role, ''), nullif(invite_type, ''), 'invited_user') as role_label,
        created_at as invited_at
      from public.invites

      union all

      select
        coalesce(nullif(user_id::text, ''), id::text) as identity,
        coalesce(nullif(workspace_role, ''), nullif(organisation_role, ''), nullif(role, ''), nullif(app_role, ''), 'invited_user') as role_label,
        invited_at
      from public.organisation_users
      where invited_at is not null
        or lower(coalesce(status, '')) in ('invited', 'pending', 'pending_invitation')

      union all

      select
        coalesce(nullif(lower(trim(recipient_email)), ''), id::text) as identity,
        coalesce(nullif(relationship_type, ''), 'partner') as role_label,
        created_at as invited_at
      from public.partner_invitations

      union all

      select
        coalesce(nullif(lower(trim(email)), ''), accepted_user_id::text, id::text) as identity,
        coalesce(nullif(role_type, ''), 'transaction_partner') as role_label,
        created_at as invited_at
      from public.transaction_partner_invitations

      union all

      select
        coalesce(nullif(lower(trim(invited_email)), ''), id::text) as identity,
        'bond_partner' as role_label,
        coalesce(sent_at, created_at) as invited_at
      from public.bond_partner_invitations

      union all

      select
        coalesce(nullif(lower(trim(email)), ''), id::text) as identity,
        coalesce(nullif(role, ''), 'attorney') as role_label,
        created_at as invited_at
      from public.attorney_firm_invitations
    ),
    deduped as (
      select distinct on (identity)
        identity,
        role_label,
        invited_at
      from invite_rows
      where identity is not null
      order by identity, invited_at desc nulls last
    ),
    current_rows as (
      select *
      from deduped
      where invited_at >= v_start
        and invited_at <= v_end
    ),
    role_counts as (
      select
        initcap(replace(role_label, '_', ' ')) as label,
        count(*)::int as value
      from current_rows
      group by role_label
      order by count(*) desc, role_label asc
      limit 4
    )
    select jsonb_build_object(
      'total', coalesce((select count(*)::int from deduped), 0),
      'current', coalesce((select count(*)::int from current_rows), 0),
      'previous', coalesce((
        select count(*)::int
        from deduped
        where invited_at >= v_previous_start
          and invited_at < v_start
      ), 0),
      'roles', coalesce((
        select jsonb_agg(jsonb_build_object('label', label, 'value', value))
        from role_counts
      ), '[]'::jsonb)
    )
  );
end;
$function$
;


DO $acl$
DECLARE f record;
BEGIN
  FOR f IN SELECT p.oid::regprocedure AS signature FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname = ANY(ARRAY[
    'revo_read_inbox_connection_credential',
    'revo_store_inbox_connection_credential',
    'revo_clear_inbox_connection_credential',
    'revo_ingest_external_enquiry',
    'arch9_alias_area',
    'arch9_backfill_area_directory',
    'attorney_firm_module_open_matter_count',
    'bridge_apply_notification_preferences_to_queue_phase9',
    'bridge_claim_commercial_enterprise_notifications_phase8',
    'bridge_claim_transaction_progress_notifications_phase3',
    'bridge_claim_weekly_digest_notifications_phase7',
    'bridge_create_transaction_notifications_for_roles',
    'bridge_ensure_relationship_role_configurations',
    'bridge_link_document_request_from_seller_upload',
    'bridge_link_transaction_required_document_from_seller_upload',
    'bridge_log_partner_prospect_event',
    'bridge_log_transaction_partner_invitation_event',
    'bridge_log_workspace_billing_event',
    'bridge_phase3_log_organization_event',
    'bridge_phase4_log_partner_connection_event',
    'bridge_phase6_choose_assignee',
    'bridge_phase6_log_transaction_event',
    'bridge_phase7_upsert_referral_event',
    'bridge_queue_commercial_enterprise_event_phase8',
    'bridge_queue_commercial_enterprise_for_user_phase8',
    'bridge_queue_transaction_operation_event_phase4',
    'bridge_queue_weekly_digest_event_phase7',
    'bridge_queue_weekly_digest_notifications_phase7',
    'bridge_record_notification_delivery_attempt_phase9',
    'bridge_refresh_commercial_intelligence_rollups',
    'bridge_resolve_notification_recipient_control_phase9',
    'bridge_resolve_private_listing_transaction_id',
    'bridge_resolve_transaction_notification_targets',
    'bridge_sync_organisation_branches_from_settings',
    'email_campaign_resolve_audience_rules',
    'report_attorney_matter_number_backfill',
    'summarize_attorney_matter_number_backfill',
    'reserve_next_attorney_matter_reference',
    'bridge_queue_bond_attorney_legal_event_phase6',
    'bridge_queue_client_seller_portal_event_phase5',
    'bridge_phase4_connection_payload',
    'bridge_resolve_partner_relationship_id'
    ])
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f.signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f.signature);
  END LOOP;
END $acl$;

DO $acl$
DECLARE f record;
BEGIN
  FOR f IN SELECT p.oid::regprocedure AS signature FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname = ANY(ARRAY[
    'arch9_admin_invited_users_summary',
    'arch9_upsert_area',
    'bridge_phase3_find_matching_prospects',
    'bridge_phase3_search_organizations',
    'bridge_notify_commercial_transaction',
    'bridge_notify_commercial_viewing',
    'get_partner_revenue_summary_phase6'
    ])
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f.signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f.signature);
  END LOOP;
END $acl$;

-- Trigger execution retains owner privileges; browsers never create these triggers.
DO $triggers$
DECLARE f record;
BEGIN
  FOR f IN SELECT p.oid::regprocedure AS signature FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.prosecdef AND p.prorettype='pg_catalog.trigger'::regtype
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f.signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f.signature);
  END LOOP;
END $triggers$;

-- Preserve the existing trusted schemas, with temporary objects searched last.
DO $paths$
DECLARE f record;
BEGIN
  FOR f IN SELECT p.oid::regprocedure AS signature FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public'
      AND NOT EXISTS (SELECT 1 FROM unnest(p.proconfig) config WHERE config LIKE 'search_path=%')
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid='pg_proc'::regclass AND d.objid=p.oid AND d.deptype='e')
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public, extensions, pg_temp', f.signature);
  END LOOP;
END $paths$;

-- Direct callers must pass the existing organisation_partner_roles row policies.

ALTER FUNCTION public.bridge_resolve_partner_role_configuration(uuid,text,uuid,uuid,uuid) SECURITY INVOKER;

COMMIT;
