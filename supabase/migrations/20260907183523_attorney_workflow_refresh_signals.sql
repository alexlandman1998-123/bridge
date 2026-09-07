begin;

-- Attorney workflow updates are atomic, but predate the shared refresh
-- watermark. Bump that watermark inside the same database transaction so
-- every subscribed role reloads its canonical matter snapshot.
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

drop trigger if exists bridge_attorney_workflow_step_refresh_signal on public.transaction_subprocess_steps;
create trigger bridge_attorney_workflow_step_refresh_signal
  after insert or update of status, comment, completed_at, completed_by, visibility_scope
  on public.transaction_subprocess_steps
  for each row
  execute function public.bridge_emit_attorney_workflow_refresh_signal();

comment on function public.bridge_emit_attorney_workflow_refresh_signal() is
  'Advances the shared transaction refresh watermark when an attorney workflow step changes.';

commit;
