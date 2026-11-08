begin;

-- Automatic handoff may fill an empty exact request. It may not replace a
-- newer file or review decision. The requirement is already locked and the
-- normal actor, audience, Storage and transaction checks run before this guard.
do $patch$
declare
  definition text := pg_get_functiondef('public.bridge_link_document_to_canonical_requirement(uuid,uuid,text,uuid,jsonb)'::regprocedure);
  target text := $target$v_previous_status := coalesce(v_requirement.status, 'pending');$target$;
  guard text := $guard$if coalesce(p_metadata->>'source', '') = 'buyer_lead_document_handoff'
    and v_requirement.satisfied_by_document_id is not null
    and v_requirement.satisfied_by_document_id is distinct from p_document_id then
    return jsonb_build_object('ok', false, 'reason', 'current_evidence_preserved');
  end if;

  $guard$;
begin
  if strpos(definition, guard) > 0 then return; end if;
  if strpos(definition, 'for update') = 0
    or (length(definition)-length(replace(definition,target,'')))/length(target) <> 1 then
    raise exception 'The canonical linker does not match the reviewed handoff correction.';
  end if;
  execute replace(definition,target,guard||target);
end;
$patch$;

commit;
