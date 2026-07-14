do $$
declare
  v_membership_definition text;
begin
  if (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname in (
          'commercial_landlord_contacts', 'commercial_mandates',
          'commercial_landlord_onboarding', 'commercial_landlord_onboarding_responses'
        ) and c.relrowsecurity) <> 4 then
    raise exception 'Expected all four commercial landlord workspace tables with RLS enabled.';
  end if;

  if (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname in (
          'transaction_partner_assignments', 'partner_portal_uploads',
          'partner_portal_document_requests', 'partner_portal_comments',
          'partner_portal_support_tickets', 'partner_portal_audit_logs',
          'partner_portal_notifications'
        ) and c.relrowsecurity) <> 7 then
    raise exception 'Expected all seven transaction partner-portal tables with RLS enabled.';
  end if;

  if (select count(*) from information_schema.columns
      where table_schema = 'public' and table_name = 'transaction_comments'
        and column_name in (
          'unit_id', 'development_id', 'organisation_id', 'author_user_id',
          'author_organisation_name', 'visibility_scope', 'update_type',
          'related_entity_type', 'related_entity_id', 'attachment_ids',
          'is_system_generated', 'updated_at'
        )) <> 12 then
    raise exception 'Transaction comment shared-activity metadata is incomplete.';
  end if;

  if (select count(*) from information_schema.columns
      where table_schema = 'public'
        and table_name in ('organisation_users', 'commercial_access_requests')
        and column_name in ('platform_role', 'commercial_role')) <> 4 then
    raise exception 'Commercial role formalisation columns are incomplete.';
  end if;

  if (select count(*) from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and not t.tgisinternal
        and t.tgname in (
          'transaction_participants_sync_transaction_role',
          'invites_sync_transaction_partner_invitation',
          'invites_sync_client_portal_activation',
          'bridge_apply_commercial_invite_membership_marker_on_accept'
        )) <> 4 then
    raise exception 'A Phase 6 synchronization trigger is missing.';
  end if;

  if has_function_privilege('anon', 'public.bridge_activate_partner_portal_onboarding(text,jsonb)', 'EXECUTE')
    or has_function_privilege('anon', 'public.bridge_delete_partner_invitation(uuid)', 'EXECUTE')
    or has_function_privilege('anon', 'public.bridge_can_operate_canonical_invites()', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.bridge_repair_partner_invitation_acceptance(uuid)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.bridge_repair_transaction_partner_invitation_acceptance(uuid)', 'EXECUTE')
  then
    raise exception 'A Phase 6 operational or repair function exposes excess privileges.';
  end if;

  if not has_function_privilege('anon', 'public.bridge_lookup_partner_portal_by_token(text)', 'EXECUTE')
    or not has_function_privilege('authenticated', 'public.bridge_activate_partner_portal_onboarding(text,jsonb)', 'EXECUTE')
    or not has_function_privilege('authenticated', 'public.bridge_delete_partner_invitation(uuid)', 'EXECUTE')
    or not has_function_privilege('service_role', 'public.bridge_repair_partner_invitation_acceptance(uuid)', 'EXECUTE')
    or not has_function_privilege('service_role', 'public.bridge_repair_transaction_partner_invitation_acceptance(uuid)', 'EXECUTE')
  then
    raise exception 'A required Phase 6 function privilege is missing.';
  end if;

  if exists (
    select 1
    from (values
      ('transaction_partner_assignments'), ('partner_portal_uploads'),
      ('partner_portal_document_requests'), ('partner_portal_comments'),
      ('partner_portal_support_tickets'), ('partner_portal_audit_logs'),
      ('partner_portal_notifications')
    ) as expected(table_name)
    where has_table_privilege('anon', format('public.%I', expected.table_name), 'INSERT,UPDATE,DELETE')
       or not has_table_privilege('authenticated', format('public.%I', expected.table_name), 'SELECT,INSERT,UPDATE,DELETE')
  ) then
    raise exception 'Partner-portal table privileges do not match the authenticated-only boundary.';
  end if;

  select pg_get_functiondef('public.bridge_membership_role(uuid)'::regprocedure)
  into v_membership_definition;
  if v_membership_definition not ilike '%accepted%'
    or v_membership_definition not ilike '%email%'
  then
    raise exception 'The newer membership helper was overwritten by a historical definition.';
  end if;
end;
$$;

do $$
begin
  perform set_config('request.jwt.claims', '{"app_metadata":{"role":"developer"}}', true);
  if public.bridge_can_operate_canonical_invites() then
    raise exception 'Generic developer metadata must not grant canonical invite operations.';
  end if;

  perform set_config('request.jwt.claims', '{"user_metadata":{"role":"founder"}}', true);
  if public.bridge_can_operate_canonical_invites() then
    raise exception 'User-editable metadata must not grant canonical invite operations.';
  end if;

  perform set_config('request.jwt.claims', '{"app_metadata":{"role":"executive"}}', true);
  if not public.bridge_can_operate_canonical_invites() then
    raise exception 'Trusted executive metadata should grant canonical invite operations.';
  end if;
end;
$$;

select jsonb_build_object(
  'commercial_workspace_tables', (
    select count(*) from information_schema.tables
    where table_schema = 'public' and table_name in (
      'commercial_landlord_contacts', 'commercial_mandates',
      'commercial_landlord_onboarding', 'commercial_landlord_onboarding_responses'
    )
  ),
  'commercial_workspace_policies', (
    select count(*) from pg_policies
    where schemaname = 'public' and tablename in (
      'commercial_landlord_contacts', 'commercial_mandates',
      'commercial_landlord_onboarding', 'commercial_landlord_onboarding_responses'
    )
  ),
  'transaction_comment_metadata_columns', (
    select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'transaction_comments'
      and column_name in (
        'unit_id', 'development_id', 'organisation_id', 'author_user_id',
        'author_organisation_name', 'visibility_scope', 'update_type',
        'related_entity_type', 'related_entity_id', 'attachment_ids',
        'is_system_generated', 'updated_at'
      )
  ),
  'partner_portal_tables', (
    select count(*) from information_schema.tables
    where table_schema = 'public' and table_name in (
      'transaction_partner_assignments', 'partner_portal_uploads',
      'partner_portal_document_requests', 'partner_portal_comments',
      'partner_portal_support_tickets', 'partner_portal_audit_logs',
      'partner_portal_notifications'
    )
  ),
  'partner_portal_policies', (
    select count(*) from pg_policies
    where schemaname = 'public' and tablename in (
      'transaction_partner_assignments', 'partner_portal_uploads',
      'partner_portal_document_requests', 'partner_portal_comments',
      'partner_portal_support_tickets', 'partner_portal_audit_logs',
      'partner_portal_notifications'
    )
  ),
  'transaction_partner_assignments', (select count(*) from public.transaction_partner_assignments),
  'transaction_participant_rows', (select count(*) from public.transaction_participants),
  'partner_invitation_rows', (select count(*) from public.partner_invitations),
  'anon_can_lookup_portal_token', has_function_privilege('anon', 'public.bridge_lookup_partner_portal_by_token(text)', 'EXECUTE'),
  'anon_can_activate_portal', has_function_privilege('anon', 'public.bridge_activate_partner_portal_onboarding(text,jsonb)', 'EXECUTE'),
  'authenticated_can_activate_portal', has_function_privilege('authenticated', 'public.bridge_activate_partner_portal_onboarding(text,jsonb)', 'EXECUTE'),
  'authenticated_can_run_repairs', has_function_privilege('authenticated', 'public.bridge_repair_partner_invitation_acceptance(uuid)', 'EXECUTE')
) as phase6_verification;
