-- Step rows belong to a subprocess; they do not carry transaction_id.
-- Resolve the owning matter before advancing its shared refresh watermark.
begin;

create or replace function public.bridge_emit_attorney_workflow_refresh_signal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_transaction_id uuid;
begin
  select lane.transaction_id
    into v_transaction_id
    from public.transaction_subprocesses lane
    where lane.id = new.subprocess_id;

  if v_transaction_id is null then
    raise exception 'Attorney workflow step has no owning transaction.'
      using errcode = '23503';
  end if;

  insert into public.transaction_refresh_signals (
    transaction_id,
    version,
    command_receipt_id,
    canonical_event_id,
    changed_at
  ) values (
    v_transaction_id,
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

revoke all on function public.bridge_emit_attorney_workflow_refresh_signal() from public, anon, authenticated;

commit;
