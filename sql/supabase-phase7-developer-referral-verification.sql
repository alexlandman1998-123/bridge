do $$
begin
  if (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname in (
          'developer_partner_relationships', 'developer_partner_agreements',
          'developer_partner_agreement_terms'
        ) and c.relrowsecurity) <> 3 then
    raise exception 'Expected all three developer-partner tables with RLS enabled.';
  end if;

  if (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname in (
          'lead_referrals', 'referral_clients', 'referral_agreements',
          'referral_status_events', 'referral_invites', 'referral_commission_events'
        ) and c.relrowsecurity) <> 6 then
    raise exception 'Expected all six referral tables with RLS enabled.';
  end if;

  if (select count(*) from pg_policies
      where schemaname = 'public'
        and tablename in (
          'developer_partner_relationships', 'developer_partner_agreements',
          'developer_partner_agreement_terms'
        )) <> 9 then
    raise exception 'Expected nine developer-partner RLS policies.';
  end if;

  if (select count(*) from pg_policies
      where schemaname = 'public'
        and tablename in (
          'lead_referrals', 'referral_clients', 'referral_agreements',
          'referral_status_events', 'referral_invites', 'referral_commission_events'
        )) <> 13 then
    raise exception 'Expected thirteen referral RLS policies.';
  end if;

  if (select count(*) from information_schema.columns
      where table_schema = 'public' and table_name = 'lead_referrals'
        and column_name in (
          'referral_type', 'related_listing_id', 'source_branch_id', 'target_branch_id',
          'protection_period_days', 'accepted_at', 'accepted_by_user_id',
          'accepted_by_email', 'declined_at', 'declined_by_user_id',
          'declined_by_email', 'decline_reason', 'agreement_locked_at'
        )) <> 13 then
    raise exception 'Referral MVP lead-referral columns are incomplete.';
  end if;

  if (select count(*) from information_schema.columns
      where table_schema = 'public' and table_name = 'organisation_preferred_partners'
        and column_name in (
          'developer_partner_relationship_id', 'partner_organisation_id',
          'source', 'scope_type', 'scope_json'
        )) <> 5 then
    raise exception 'Developer partner default-routing columns are incomplete.';
  end if;

  if (select count(*) from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and not t.tgisinternal
        and t.tgname in (
          'trg_developer_partner_relationships_updated_at',
          'trg_developer_partner_agreements_updated_at',
          'trg_developer_partner_agreement_terms_updated_at',
          'trg_developer_partner_relationship_identity_guard',
          'referral_status_events_lead_activity_signal'
        )) <> 5 then
    raise exception 'A Phase 7 lifecycle or identity trigger is missing.';
  end if;

  if to_regprocedure('public.bridge_accept_developer_partner_invitation(text,text,text)') is not null then
    raise exception 'The anonymous-compatible legacy developer invite acceptance signature still exists.';
  end if;

  if has_function_privilege('anon', 'public.bridge_prepare_developer_partner_invitation(uuid)', 'EXECUTE')
    or has_function_privilege('anon', 'public.bridge_accept_developer_partner_invitation(text,text,text,uuid)', 'EXECUTE')
    or has_function_privilege('anon', 'public.bridge_respond_referral_terms(uuid,text,text,text,jsonb)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.bridge_referral_status_event_to_lead_activity()', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.bridge_touch_developer_partner_updated_at()', 'EXECUTE')
  then
    raise exception 'A Phase 7 operational or trigger function exposes excess privileges.';
  end if;

  if not has_function_privilege('anon', 'public.bridge_get_developer_partner_invitation(text)', 'EXECUTE')
    or not has_function_privilege('anon', 'public.bridge_lookup_referral_invite_by_token(text)', 'EXECUTE')
    or not has_function_privilege('anon', 'public.bridge_respond_referral_invite(text,text,text,text,text)', 'EXECUTE')
    or not has_function_privilege('authenticated', 'public.bridge_accept_developer_partner_invitation(text,text,text,uuid)', 'EXECUTE')
    or not has_function_privilege('authenticated', 'public.bridge_respond_referral_terms(uuid,text,text,text,jsonb)', 'EXECUTE')
  then
    raise exception 'A required Phase 7 function privilege is missing.';
  end if;

  if exists (
    select 1
    from (values
      ('developer_partner_relationships'), ('developer_partner_agreements'),
      ('developer_partner_agreement_terms'), ('lead_referrals'), ('referral_clients'),
      ('referral_agreements'), ('referral_status_events'), ('referral_invites'),
      ('referral_commission_events')
    ) as expected(table_name)
    where has_table_privilege('anon', format('public.%I', expected.table_name), 'SELECT')
       or has_table_privilege('anon', format('public.%I', expected.table_name), 'INSERT')
       or has_table_privilege('anon', format('public.%I', expected.table_name), 'UPDATE')
       or has_table_privilege('anon', format('public.%I', expected.table_name), 'DELETE')
  ) then
    raise exception 'Anonymous users retain direct Phase 7 table privileges.';
  end if;
end;
$$;

do $$
declare
  v_result jsonb;
begin
  v_result := public.bridge_get_developer_partner_invitation('phase7-invalid-token');
  if v_result ->> 'reason' <> 'invite_not_found' then
    raise exception 'Invalid developer invitation lookup did not fail closed: %', v_result;
  end if;

  v_result := public.bridge_accept_developer_partner_invitation(
    'phase7-invalid-token', null, null, gen_random_uuid()
  );
  if v_result ->> 'reason' <> 'authentication_required' then
    raise exception 'Unauthenticated developer invitation acceptance did not fail closed: %', v_result;
  end if;

  v_result := public.bridge_lookup_referral_invite_by_token('phase7-invalid-token');
  if v_result ->> 'code' <> 'not_found' then
    raise exception 'Invalid referral invitation lookup did not fail closed: %', v_result;
  end if;

  v_result := public.bridge_respond_referral_invite(
    'phase7-invalid-token', 'accept', null, null, null
  );
  if v_result ->> 'code' <> 'not_found' then
    raise exception 'Invalid referral invitation response did not fail closed: %', v_result;
  end if;
end;
$$;

select jsonb_build_object(
  'developer_partner_tables', (
    select count(*) from information_schema.tables
    where table_schema = 'public' and table_name in (
      'developer_partner_relationships', 'developer_partner_agreements',
      'developer_partner_agreement_terms'
    )
  ),
  'developer_partner_policies', (
    select count(*) from pg_policies
    where schemaname = 'public' and tablename in (
      'developer_partner_relationships', 'developer_partner_agreements',
      'developer_partner_agreement_terms'
    )
  ),
  'referral_tables', (
    select count(*) from information_schema.tables
    where table_schema = 'public' and table_name in (
      'lead_referrals', 'referral_clients', 'referral_agreements',
      'referral_status_events', 'referral_invites', 'referral_commission_events'
    )
  ),
  'referral_policies', (
    select count(*) from pg_policies
    where schemaname = 'public' and tablename in (
      'lead_referrals', 'referral_clients', 'referral_agreements',
      'referral_status_events', 'referral_invites', 'referral_commission_events'
    )
  ),
  'developer_relationship_rows', (select count(*) from public.developer_partner_relationships),
  'lead_referral_rows', (select count(*) from public.lead_referrals),
  'referral_invite_rows', (select count(*) from public.referral_invites),
  'anon_can_lookup_developer_invite', has_function_privilege('anon', 'public.bridge_get_developer_partner_invitation(text)', 'EXECUTE'),
  'anon_can_accept_developer_invite', has_function_privilege('anon', 'public.bridge_accept_developer_partner_invitation(text,text,text,uuid)', 'EXECUTE'),
  'anon_can_lookup_referral_invite', has_function_privilege('anon', 'public.bridge_lookup_referral_invite_by_token(text)', 'EXECUTE'),
  'anon_can_respond_referral_invite', has_function_privilege('anon', 'public.bridge_respond_referral_invite(text,text,text,text,text)', 'EXECUTE'),
  'anon_can_respond_internal_terms', has_function_privilege('anon', 'public.bridge_respond_referral_terms(uuid,text,text,text,jsonb)', 'EXECUTE')
) as phase7_verification;
