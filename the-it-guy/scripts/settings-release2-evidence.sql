-- Run read-only in the target Supabase SQL editor before Release 2 approval.
-- Retain the Release 1 GO report and replace every null operational field with
-- evidence from one named monitoring source covering at least 72 hours.
select jsonb_build_object(
  'release1', jsonb_build_object(
    'version', 'settings_phase7_release1_v1',
    'status', null,
    'completedAt', null
  ),
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
  'monitoringSource', null,
  'observationHours', null,
  'metrics', jsonb_build_object(
    'settingsWrites', null,
    'failedSettingsWrites', null,
    'settingsErrors', null,
    'ownershipTransferFailures', null,
    'criticalSupportIncidents', null
  )
) as settings_release_2_evidence;
