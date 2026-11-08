begin;
create or replace function journey_private.save_current_task_answers(p_step uuid,p_subprocess uuid,p_answers jsonb)
returns void language plpgsql security invoker set search_path='' as $answers$
declare entry record;
begin
 if p_answers is null then return;end if;
 if jsonb_typeof(p_answers)<>'object' then raise exception 'Task confirmations must be an object' using errcode='22023';end if;
 for entry in select * from jsonb_each(p_answers) loop
  if jsonb_typeof(entry.value)<>'object' or coalesce(entry.value->>'answer','') not in ('yes','no','not_applicable') then
   raise exception 'Invalid task confirmation answer' using errcode='22023';end if;
 end loop;
 insert into public.attorney_task_confirmations(step_id,subprocess_id,task_confirmations)
 select id,subprocess_id,p_answers from public.transaction_subprocess_steps where id=p_step and subprocess_id=p_subprocess
 on conflict(step_id) do update set task_confirmations=excluded.task_confirmations,updated_at=now();
 if not found then raise exception 'Task confirmation target not found' using errcode='22023';end if;
end $answers$;
revoke all on function journey_private.save_current_task_answers(uuid,uuid,jsonb) from public,anon,authenticated;

-- Both the current command and the existing history trigger use one validator.
create or replace function public.bridge_persist_task_confirmations()
returns trigger language plpgsql security invoker set search_path='' as $history$
begin
 perform journey_private.save_current_task_answers((new.metadata->>'stepId')::uuid,new.subprocess_id,
   new.metadata#>'{workPacket,taskConfirmations}');
 return new;
end $history$;
revoke all on function public.bridge_persist_task_confirmations() from public,anon,authenticated;

do $patch$ declare definition text; anchor text:='  v_result := public.bridge_update_attorney_workflow_step_v3(';
begin
 definition:=pg_get_functiondef('public.bridge_update_attorney_workflow_step_v4(uuid,text,uuid,text,uuid,timestamptz,text,text,jsonb)'::regprocedure);
 if position('journey_private.save_current_task_answers' in definition)=0 then
  if position(anchor in definition)=0 then raise exception 'Unsupported atomic attorney task command';end if;
  -- This anchor follows authentication, lane authority, receipt replay,
  -- expected-version and visibility checks. A failing completion rolls it back.
  definition:=replace(definition,anchor,
   E'  perform journey_private.save_current_task_answers(v_step.id,v_step.subprocess_id,p_work_packet->\'taskConfirmations\');\n\n'||anchor);
  execute definition;
 end if;
end $patch$;
notify pgrst,'reload schema';
commit;
