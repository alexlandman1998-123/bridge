begin;

-- Matter workflow mutations already advance transaction_refresh_signals.
-- Assignment mutations must do the same so a dashboard discovers newly
-- assigned matters and removes matters whose assignment is no longer active.
create or replace function public.bridge_emit_attorney_assignment_refresh_signal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_transaction_id uuid;
begin
  target_transaction_id := case when tg_op = 'DELETE' then old.transaction_id else new.transaction_id end;

  insert into public.transaction_refresh_signals (
    transaction_id,
    version,
    command_receipt_id,
    canonical_event_id,
    changed_at
  ) values (
    target_transaction_id,
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

  return null;
end;
$$;

revoke all on function public.bridge_emit_attorney_assignment_refresh_signal() from public;

drop trigger if exists bridge_attorney_assignment_refresh_signal
  on public.transaction_attorney_assignments;
create trigger bridge_attorney_assignment_refresh_signal
  after insert or update of firm_id, assignment_type, department_id,
    primary_attorney_id, secretary_id, admin_handler_id, status or delete
  on public.transaction_attorney_assignments
  for each row
  execute function public.bridge_emit_attorney_assignment_refresh_signal();

comment on function public.bridge_emit_attorney_assignment_refresh_signal() is
  'Advances the canonical transaction refresh watermark when an attorney matter assignment changes.';

commit;
