select jsonb_build_object(
  'portal_columns', (
    select count(*)
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'private_listing_seller_onboarding'
      and column_name like 'seller_portal_%'
  ),
  'null_stable_tokens', (
    select count(*)
    from public.private_listing_seller_onboarding
    where nullif(trim(seller_portal_token), '') is null
  ),
  'duplicate_stable_token_groups', (
    select count(*) from (
      select seller_portal_token
      from public.private_listing_seller_onboarding
      group by seller_portal_token
      having count(*) > 1
    ) duplicate_tokens
  ),
  'portal_tables_with_rls', (
    select count(*)
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in ('client_portal_access_events', 'private_listing_seller_portal_security_alerts')
      and c.relrowsecurity
  ),
  'portal_indexes', (
    select count(*)
    from pg_indexes
    where schemaname = 'public'
      and indexname in (
        'client_portal_access_events_created_idx',
        'client_portal_access_events_outcome_idx',
        'private_listing_seller_onboarding_portal_token_uidx',
        'private_listing_seller_onboarding_invite_hash_idx',
        'private_listing_seller_onboarding_recovery_hash_idx',
        'private_listing_seller_portal_security_alerts_open_uidx',
        'private_listing_seller_portal_security_alerts_listing_idx'
      )
  ),
  'final_rpc_count', (
    select count(*)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'bridge_private_listing_seller_portal_access_state',
        'bridge_set_private_listing_seller_portal_password',
        'bridge_verify_private_listing_seller_portal_password',
        'bridge_reset_private_listing_seller_portal_password',
        'bridge_private_listing_seller_portal_payload',
        'bridge_upload_private_listing_seller_document',
        'bridge_issue_private_listing_seller_portal_invite',
        'bridge_manage_private_listing_seller_portal',
        'bridge_private_listing_seller_portal_diagnostics',
        'bridge_request_private_listing_seller_portal_recovery',
        'bridge_complete_private_listing_seller_portal_recovery',
        'bridge_prune_client_portal_security_history'
      )
  ),
  'anon_can_request_recovery', has_function_privilege('anon', 'public.bridge_request_private_listing_seller_portal_recovery(text)', 'EXECUTE'),
  'authenticated_can_request_recovery', has_function_privilege('authenticated', 'public.bridge_request_private_listing_seller_portal_recovery(text)', 'EXECUTE'),
  'service_can_request_recovery', has_function_privilege('service_role', 'public.bridge_request_private_listing_seller_portal_recovery(text)', 'EXECUTE'),
  'anon_can_manage_portal', has_function_privilege('anon', 'public.bridge_manage_private_listing_seller_portal(text,text,text)', 'EXECUTE'),
  'authenticated_can_manage_portal', has_function_privilege('authenticated', 'public.bridge_manage_private_listing_seller_portal(text,text,text)', 'EXECUTE'),
  'anon_can_complete_recovery', has_function_privilege('anon', 'public.bridge_complete_private_listing_seller_portal_recovery(text,text)', 'EXECUTE')
) as phase4_verification;
