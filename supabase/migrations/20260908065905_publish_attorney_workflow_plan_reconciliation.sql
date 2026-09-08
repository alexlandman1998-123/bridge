begin;

-- A routing-profile revision is an operational change. It must refresh every
-- professional workspace through the canonical sync pipeline, without making
-- private legal configuration visible to buyers or sellers.
insert into public.transaction_sync_action_catalog (
  action_key,
  owner_role,
  canonical_event_type,
  affected_lane,
  source_table,
  default_visibility,
  client_safe_projection_required
) values (
  'ATTORNEY_WORKFLOW_PLAN_RECONCILED',
  'transfer_attorney',
  'AttorneyWorkflowPlanReconciled',
  'transfer',
  'transactions',
  'professional_shared',
  false
)
on conflict (action_key) do update set
  owner_role = excluded.owner_role,
  canonical_event_type = excluded.canonical_event_type,
  affected_lane = excluded.affected_lane,
  source_table = excluded.source_table,
  default_visibility = excluded.default_visibility,
  client_safe_projection_required = excluded.client_safe_projection_required,
  updated_at = now();

commit;
