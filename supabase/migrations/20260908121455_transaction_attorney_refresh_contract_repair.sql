begin;

-- Production already has the refresh table but is missing the trigger that
-- advances it when the attorney workflow changes. Keep this repair additive
-- and idempotent so it is safe against partially reconciled history.
create or replace function public.bridge_emit_attorney_workflow_refresh_signal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.transaction_refresh_signals (
    transaction_id,
    version,
    command_receipt_id,
    canonical_event_id,
    changed_at
  ) values (
    new.transaction_id,
    1,
    null,
    null,
    now()
  )
  on conflict (transaction_id) do update set
    version = public.transaction_refresh_signals.version + 1,
    command_receipt_id = null,
    canonical_event_id = null,
    changed_at = excluded.changed_at;

  return new;
end;
$$;

revoke all on function public.bridge_emit_attorney_workflow_refresh_signal() from public;

drop trigger if exists bridge_attorney_workflow_step_refresh_signal
  on public.transaction_subprocess_steps;
create trigger bridge_attorney_workflow_step_refresh_signal
  after insert or update of status, comment, completed_at, completed_by, visibility_scope
  on public.transaction_subprocess_steps
  for each row
  execute function public.bridge_emit_attorney_workflow_refresh_signal();

-- A changed routing plan must also publish through the canonical activity
-- catalog. The row was absent even though the target table exists.
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

notify pgrst, 'reload schema';

commit;
