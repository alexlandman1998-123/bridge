with rpc_contract_checks as (
  select
    'workspace_onboarding_unauth_contract' as check_key,
    'rpc_contract' as check_type,
    'success=false; code=permission_denied' as expected,
    coalesce(result->>'code', '(missing code)') as observed,
    coalesce((result->>'success')::boolean, false) is false
      and result->>'code' = 'permission_denied' as ready,
    result::text as details
  from (
    select public.bridge_complete_workspace_onboarding(
      jsonb_build_object(
        'workspace_type', 'agency',
        'workspace_kind', 'agency',
        'organisation', jsonb_build_object('name', 'Phase 2 unauthenticated probe'),
        'owner', jsonb_build_object('workspace_role', 'principal'),
        'branches', jsonb_build_array(jsonb_build_object('name', 'Head Office')),
        'settings', jsonb_build_object('source', 'phase2_onboarding_behavior_check')
      )
    ) as result
  ) probe

  union all

  select
    'principal_claim_invite_unauth_contract' as check_key,
    'rpc_contract' as check_type,
    'success=false; code=not_authenticated' as expected,
    coalesce(result->>'code', '(missing code)') as observed,
    coalesce((result->>'success')::boolean, false) is false
      and result->>'code' = 'not_authenticated' as ready,
    result::text as details
  from (
    select public.bridge_create_principal_claim_invite('{}'::jsonb) as result
  ) probe

  union all

  select
    'principal_claim_completion_unauth_contract' as check_key,
    'rpc_contract' as check_type,
    'success=false; code=not_authenticated' as expected,
    coalesce(result->>'code', '(missing code)') as observed,
    coalesce((result->>'success')::boolean, false) is false
      and result->>'code' = 'not_authenticated' as ready,
    result::text as details
  from (
    select public.bridge_complete_principal_claim_onboarding('{}'::jsonb) as result
  ) probe
),
function_privilege_checks as (
  select
    check_key,
    'function_privilege' as check_type,
    'authenticated has EXECUTE' as expected,
    case when ready then 'authenticated can execute' else 'authenticated cannot execute' end as observed,
    ready,
    regprocedure_name as details
  from (
    values
      ('workspace_onboarding_authenticated_execute', 'public.bridge_complete_workspace_onboarding(jsonb)'),
      ('principal_claim_invite_authenticated_execute', 'public.bridge_create_principal_claim_invite(jsonb)'),
      ('principal_claim_completion_authenticated_execute', 'public.bridge_complete_principal_claim_onboarding(jsonb)')
  ) as v(check_key, regprocedure_name)
  cross join lateral (
    select has_function_privilege('authenticated', regprocedure_name, 'EXECUTE') as ready
  ) privilege
),
column_contract_checks as (
  select
    'organisation_users_branch_scope_not_null' as check_key,
    'column_contract' as check_type,
    'organisation_users.branch_scope is NOT NULL' as expected,
    coalesce(c.is_nullable, '(missing column)') as observed,
    c.column_name is not null and c.is_nullable = 'NO' as ready,
    coalesce(c.column_default, '(no default)') as details
  from (values ('branch_scope')) as required(column_name)
  left join information_schema.columns c
    on c.table_schema = 'public'
    and c.table_name = 'organisation_users'
    and c.column_name = required.column_name

  union all

  select
    'organisation_users_branch_scope_default' as check_key,
    'column_contract' as check_type,
    'organisation_users.branch_scope defaults to own' as expected,
    coalesce(c.column_default, '(missing default)') as observed,
    c.column_name is not null and coalesce(c.column_default, '') like '%own%' as ready,
    coalesce(c.is_nullable, '(missing column)') as details
  from (values ('branch_scope')) as required(column_name)
  left join information_schema.columns c
    on c.table_schema = 'public'
    and c.table_name = 'organisation_users'
    and c.column_name = required.column_name
),
open_membership_contract_checks as (
  select
    'principal_claim_pending_membership_queryable' as check_key,
    'table_contract' as check_type,
    'organisation_users supports pending principal-claim membership lookup' as expected,
    case when ready then 'required columns present' else 'required columns missing' end as observed,
    ready,
    missing_columns::text as details
  from (
    select
      count(actual.column_name) = 7 as ready,
      coalesce(
        array_agg(required.column_name order by required.column_name) filter (where actual.column_name is null),
        '{}'::text[]
      ) as missing_columns
    from (
      values
        ('user_id'),
        ('membership_status'),
        ('status'),
        ('workspace_role'),
        ('organisation_role'),
        ('role'),
        ('scope_metadata')
    ) as required(column_name)
    left join information_schema.columns actual
      on actual.table_schema = 'public'
      and actual.table_name = 'organisation_users'
      and actual.column_name = required.column_name
  ) probe
),
all_checks as (
  select * from rpc_contract_checks
  union all
  select * from function_privilege_checks
  union all
  select * from column_contract_checks
  union all
  select * from open_membership_contract_checks
)
select
  check_key,
  check_type,
  expected,
  observed,
  ready,
  details
from all_checks
order by check_type, check_key;
