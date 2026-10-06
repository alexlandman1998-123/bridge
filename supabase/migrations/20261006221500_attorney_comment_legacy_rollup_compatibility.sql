begin;

-- Private notes do not change workflow outcomes. Older instructed matters can
-- have lane state without a derived summary; that must not prevent a task note.
-- Keep the summary prerequisite for every other canonical command, and never
-- fabricate a summary or progress merely to store a comment.
do $private_comment_rollup$
declare
  v_definition text := pg_get_functiondef('public.bridge_commit_transaction_sync_command_phase2(uuid,text,text,text,text,text,jsonb,text,text,text,text,jsonb)'::regprocedure);
  v_guard text := $guard$if v_rollup_ref is null then raise exception 'Canonical transaction rollup is required before Phase 2 commands.' using errcode = 'P0001'; end if;$guard$;
begin
  if (length(v_definition) - length(replace(v_definition, v_guard, ''))) / length(v_guard) <> 1 then
    raise exception 'Expected one canonical summary guard; refusing to change an unexpected function';
  end if;
  execute replace(v_definition, v_guard,
    $guard$if v_rollup_ref is null and not (
    v_visibility = 'internal' and v_catalog.action_key in (
      'TRANSFER_ATTORNEY_COMMENT_ADDED', 'BOND_ATTORNEY_COMMENT_ADDED', 'CANCELLATION_ATTORNEY_COMMENT_ADDED'
    )
  ) then raise exception 'Canonical transaction rollup is required before Phase 2 commands.' using errcode = 'P0001'; end if;$guard$);
end;
$private_comment_rollup$;

notify pgrst, 'reload schema';
commit;
