with function_checks as (
  select
    check_key,
    object_type,
    expected,
    to_regprocedure(regprocedure_name) is not null as live_exists,
    case
      when definition_contains is null then null
      when to_regprocedure(regprocedure_name) is null then false
      else position(definition_contains in pg_get_functiondef(to_regprocedure(regprocedure_name))) > 0
    end as definition_ok,
    regprocedure_name as details
  from (
    values
      ('workspace_onboarding_rpc', 'function', 'bridge_complete_workspace_onboarding(payload jsonb)', 'public.bridge_complete_workspace_onboarding(jsonb)', null),
      ('workspace_onboarding_branch_scope_fix', 'function_body', 'bridge_complete_workspace_onboarding handles null branch_scope', 'public.bridge_complete_workspace_onboarding(jsonb)', 'v_branch_scope is null or v_branch_scope not in'),
      ('workspace_onboarding_legacy_rpc', 'function', 'bridge_complete_workspace_onboarding_legacy_20260524(payload jsonb)', 'public.bridge_complete_workspace_onboarding_legacy_20260524(jsonb)', null),
      ('principal_claim_invite_rpc', 'function', 'bridge_create_principal_claim_invite(payload jsonb)', 'public.bridge_create_principal_claim_invite(jsonb)', null),
      ('principal_claim_completion_rpc', 'function', 'bridge_complete_principal_claim_onboarding(payload jsonb)', 'public.bridge_complete_principal_claim_onboarding(jsonb)', null),
      ('principal_claim_sync_trigger_function', 'function', 'bridge_sync_principal_claim_membership()', 'public.bridge_sync_principal_claim_membership()', null),
      ('workspace_repair_email_claim_function', 'function_body', 'bridge_repair_workspace_onboarding includes email-claim repair body', 'public.bridge_repair_workspace_onboarding(uuid)', 'bridge_repair_workspace_onboarding_email_claim')
  ) as v(check_key, object_type, expected, regprocedure_name, definition_contains)
),
policy_checks as (
  select
    check_key,
    'policy' as object_type,
    policy_name as expected,
    exists (
      select 1
      from pg_policies p
      where p.schemaname = 'public'
        and p.tablename = table_name
        and p.policyname = policy_name
    ) as live_exists,
    null::boolean as definition_ok,
    table_name || '.' || policy_name as details
  from (
    values
      ('invites_insert_workspace_admin_policy', 'invites', 'invites_insert_workspace_admin'),
      ('invites_insert_member_fallback_policy', 'invites', 'invites_insert_active_workspace_member_fallback'),
      ('organisations_principal_claim_select_policy', 'organisations', 'organisations_agency_select'),
      ('organisation_users_principal_claim_select_policy', 'organisation_users', 'organisation_users_agency_select')
  ) as v(check_key, table_name, policy_name)
),
constraint_checks as (
  select
    check_key,
    'constraint' as object_type,
    constraint_name as expected,
    exists (
      select 1
      from pg_constraint c
      join pg_class r on r.oid = c.conrelid
      join pg_namespace n on n.oid = r.relnamespace
      where n.nspname = 'public'
        and r.relname = table_name
        and c.conname = constraint_name
        and (definition_contains is null or pg_get_constraintdef(c.oid) like '%' || definition_contains || '%')
    ) as live_exists,
    null::boolean as definition_ok,
    table_name || '.' || constraint_name as details
  from (
    values
      ('invites_principal_claim_type_constraint', 'invites', 'invites_invite_type_check', 'principal_claim_invite'),
      ('workspace_preference_principal_claim_source_constraint', 'user_workspace_preferences', 'user_workspace_preferences_source_check', 'principal_claim_completed')
  ) as v(check_key, table_name, constraint_name, definition_contains)
),
trigger_checks as (
  select
    check_key,
    'trigger' as object_type,
    trigger_name as expected,
    exists (
      select 1
      from pg_trigger t
      join pg_class r on r.oid = t.tgrelid
      join pg_namespace n on n.oid = r.relnamespace
      where n.nspname = 'public'
        and r.relname = table_name
        and t.tgname = trigger_name
        and not t.tgisinternal
    ) as live_exists,
    null::boolean as definition_ok,
    table_name || '.' || trigger_name as details
  from (
    values
      ('principal_claim_sync_trigger', 'invites', 'trg_bridge_sync_principal_claim_membership')
  ) as v(check_key, table_name, trigger_name)
),
table_checks as (
  select
    check_key,
    'table' as object_type,
    expected,
    to_regclass(regclass_name) is not null as live_exists,
    null::boolean as definition_ok,
    regclass_name as details
  from (
    values
      ('workspace_onboarding_completions_table', 'workspace_onboarding_completions exists', 'public.workspace_onboarding_completions'),
      ('onboarding_states_table', 'onboarding_states exists', 'public.onboarding_states'),
      ('invites_table', 'invites exists', 'public.invites')
  ) as v(check_key, expected, regclass_name)
)
select
  check_key,
  object_type,
  expected,
  live_exists,
  coalesce(definition_ok, live_exists) as ready,
  details
from function_checks
union all
select check_key, object_type, expected, live_exists, coalesce(definition_ok, live_exists) as ready, details from policy_checks
union all
select check_key, object_type, expected, live_exists, coalesce(definition_ok, live_exists) as ready, details from constraint_checks
union all
select check_key, object_type, expected, live_exists, coalesce(definition_ok, live_exists) as ready, details from trigger_checks
union all
select check_key, object_type, expected, live_exists, coalesce(definition_ok, live_exists) as ready, details from table_checks
order by object_type, check_key;
