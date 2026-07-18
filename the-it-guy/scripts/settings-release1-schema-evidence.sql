-- Run read-only in the target Supabase SQL editor before Release 1 approval.
select jsonb_build_object(
  'schema', jsonb_build_object(
    'jobTitleColumn', exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'organisation_users' and column_name = 'job_title'
    ),
    'jobTitleRpc', to_regprocedure('public.bridge_set_organisation_user_job_title(uuid,text)') is not null,
    'roleGovernanceRpc', to_regprocedure('public.bridge_set_organisation_user_role(uuid,text)') is not null,
    'ownershipTransferRpc', to_regprocedure('public.bridge_transfer_organisation_ownership(uuid)') is not null,
    'securityAuditEvents', to_regclass('public.security_audit_events') is not null,
    'organizationEvents', to_regclass('public.organization_events') is not null,
    'billingEvents', to_regclass('public.workspace_billing_events') is not null
  ),
  'metrics', jsonb_build_object(
    'settingsErrors24h', null,
    'failedSaves24h', null,
    'ownershipTransferFailures24h', null
  )
) as settings_release_1_evidence;
