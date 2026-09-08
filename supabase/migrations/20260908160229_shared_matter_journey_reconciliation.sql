begin;
create table journey_private.reconciliation_receipts (
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  command_id uuid not null,
  actor_id uuid not null,
  before_fingerprint text not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key(transaction_id,command_id)
);
alter table journey_private.reconciliation_receipts enable row level security;
revoke all on journey_private.reconciliation_receipts from public,anon,authenticated;

-- An internal report, never a portal payload. No notes, message bodies or files.
create function journey_private.audit_matter(p_transaction_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_tx public.transactions%rowtype; v_plan jsonb; v_profile jsonb;
  v_issues jsonb:='[]'; v_expected jsonb:='[]'; v_rows jsonb; v_events jsonb; v_lifecycle jsonb;
  v_lane jsonb; v_key text; v_saved record; v_step record; v_count integer; v_total integer; v_done integer; v_excluded integer;
  v_status text; v_next text; v_stage text; v_candidate text; v_has_plan boolean:=true; v_fingerprint text; v_revision bigint;
begin
  select * into v_tx from public.transactions where id=p_transaction_id;
  if not found then raise exception 'Matter not found.' using errcode='P0002'; end if;
  v_plan:=v_tx.routing_profile_json->'workflowPlan'; v_profile:=v_tx.routing_profile_json->'matterProfile';
  select coalesce(jsonb_agg(jsonb_build_object('id',l.id,'laneKey',l.process_type,'currentStage',l.current_stage,
    'status',l.status,'laneStatus',l.lane_status,'updatedAt',l.updated_at,
    'steps',(select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'key',s.step_key,'status',s.status,
      'updatedAt',s.updated_at,'completedAt',s.completed_at) order by s.step_key,s.id),'[]'::jsonb)
      from public.transaction_subprocess_steps s where s.subprocess_id=l.id)) order by l.process_type,l.id),'[]'::jsonb)
    into v_rows from public.transaction_subprocesses l where l.transaction_id=p_transaction_id and l.process_type in ('transfer','bond','cancellation');
  select coalesce(jsonb_agg(to_jsonb(e) order by e.lane_key,e.step_key),'[]'::jsonb) into v_events from (
    select distinct on (lane_key,step_key) lane_key,step_key,status,revision,command_id
    from journey_private.task_events where transaction_id=p_transaction_id order by lane_key,step_key,revision desc,command_id desc) e;
  select jsonb_build_object('stage',w.current_stage,'status',w.status) into v_lifecycle
    from public.transaction_lifecycle_workflows w where w.transaction_id=p_transaction_id;
  select version into v_revision from public.transaction_refresh_signals where transaction_id=p_transaction_id;
  v_fingerprint:=md5(jsonb_build_object('routingProfile',v_tx.routing_profile_json,'rows',v_rows,'events',v_events,
    'lifecycleState',v_tx.lifecycle_state,'mainStage',v_tx.current_main_stage,'summary',v_tx.current_sub_stage_summary,
    'lifecycle',v_lifecycle,'revision',v_revision)::text);

  if coalesce(v_plan->>'status','')<>'active' or jsonb_typeof(v_plan->'lanes') is distinct from 'array' then
    v_issues:=v_issues||jsonb_build_array(jsonb_build_object('code','MISSING_ACTIVE_PLAN','severity','review')); v_has_plan:=false;
  elsif jsonb_array_length(v_plan->'lanes')=0 then
    v_issues:=v_issues||jsonb_build_array(jsonb_build_object('code','EMPTY_PLAN','severity','review')); v_has_plan:=false;
  end if;
  if coalesce(v_profile->>'status','')<>'confirmed' or coalesce(v_plan->>'provisional','true')<>'false' then
    v_issues:=v_issues||jsonb_build_array(jsonb_build_object('code','PROFILE_CONFIRMATION_REQUIRED','severity','review'));
  elsif nullif(v_profile->>'factFingerprint','') is null
    or (v_plan->>'matterProfileFingerprint') is distinct from (v_profile->>'factFingerprint')
    or (v_plan->>'matterProfileRevision') is distinct from (v_profile->>'revision') then
    v_issues:=v_issues||jsonb_build_array(jsonb_build_object('code','PROFILE_PLAN_MISMATCH','severity','review'));
  end if;
  if coalesce(v_plan->>'version','') not in ('attorney_matter_workflow_plan_v1','attorney_matter_workflow_plan_v2') then
    v_issues:=v_issues||jsonb_build_array(jsonb_build_object('code','UNKNOWN_PLAN_VERSION','severity','review'));
  end if;
  if lower(coalesce(v_tx.lifecycle_state,'')) in ('registered','completed','archived','cancelled','canceled') then
    v_issues:=v_issues||jsonb_build_array(jsonb_build_object('code','TERMINAL_MATTER_REVIEW','severity','review'));
  end if;
  if v_has_plan then
    if jsonb_typeof(v_plan->'laneKeys') is distinct from 'array' then
      v_issues:=v_issues||jsonb_build_array(jsonb_build_object('code','PLAN_LANE_KEYS_INVALID','severity','review'));
    elsif (select jsonb_agg(k order by k) from jsonb_array_elements_text(v_plan->'laneKeys') k)
      is distinct from (select jsonb_agg(p->>'laneKey' order by p->>'laneKey') from jsonb_array_elements(v_plan->'lanes') p) then
      v_issues:=v_issues||jsonb_build_array(jsonb_build_object('code','PLAN_LANE_KEYS_MISMATCH','severity','review'));
    end if;
    for v_lane in select value from jsonb_array_elements(v_plan->'lanes') loop
      v_key:=v_lane->>'laneKey';
      if v_key is null or v_key not in ('transfer','bond','cancellation')
        or jsonb_typeof(v_lane->'stepKeys') is distinct from 'array' then
        v_issues:=v_issues||jsonb_build_array(jsonb_build_object('code','INVALID_PLANNED_LANE','severity','review')); continue;
      end if;
      if (select count(*) from jsonb_array_elements(v_plan->'lanes') p where p->>'laneKey'=v_key)<>1 then
        v_issues:=v_issues||jsonb_build_array(jsonb_build_object('code','DUPLICATE_PLANNED_LANE','severity','review','laneKey',v_key)); continue;
      end if;
      if jsonb_array_length(v_lane->'stepKeys')=0 or (select count(distinct k) from jsonb_array_elements_text(v_lane->'stepKeys') k)<>jsonb_array_length(v_lane->'stepKeys') then
        v_issues:=v_issues||jsonb_build_array(jsonb_build_object('code','EMPTY_OR_DUPLICATE_PLANNED_TASKS','severity','review','laneKey',v_key)); continue;
      end if;
      if exists(select 1 from jsonb_array_elements_text(v_lane->'stepKeys') k where not exists
        (select 1 from journey_private.task_catalog c where c.lane_key=v_key and c.step_key=k)) then
        v_issues:=v_issues||jsonb_build_array(jsonb_build_object('code','UNKNOWN_TASK_MAPPING','severity','review','laneKey',v_key)); continue;
      end if;
      select count(*) into v_count from public.transaction_subprocesses where transaction_id=p_transaction_id and process_type=v_key;
      if v_count<>1 then
        v_issues:=v_issues||jsonb_build_array(jsonb_build_object('code',case when v_count=0 then 'MISSING_LANE' else 'DUPLICATE_SAVED_LANE' end,'severity','review','laneKey',v_key)); continue;
      end if;
      select * into v_saved from public.transaction_subprocesses where transaction_id=p_transaction_id and process_type=v_key;
      v_next:=null; v_total:=0; v_done:=0; v_excluded:=0; v_status:='not_started';
      for v_step in select k.key,k.ordinality,count(s.id) count,min(s.status) status
        from jsonb_array_elements_text(v_lane->'stepKeys') with ordinality k(key,ordinality)
        left join public.transaction_subprocess_steps s on s.subprocess_id=v_saved.id and s.step_key=k.key
        group by k.key,k.ordinality order by k.ordinality loop
        if v_step.count<>1 then
          v_issues:=v_issues||jsonb_build_array(jsonb_build_object('code',case when v_step.count=0 then 'MISSING_TASK_ROW' else 'DUPLICATE_TASK_ROWS' end,'severity','review','laneKey',v_key,'taskKey',v_step.key));
        elsif v_step.status is null or v_step.status not in ('not_started','in_progress','waiting','blocked','completed','completed_externally','not_applicable') then
          v_issues:=v_issues||jsonb_build_array(jsonb_build_object('code','UNKNOWN_TASK_OUTCOME','severity','review','laneKey',v_key,'taskKey',v_step.key));
        end if;
        if v_step.status='not_applicable' then v_excluded:=v_excluded+1;
        else v_total:=v_total+1; end if;
        if v_step.status in ('completed','completed_externally') then v_done:=v_done+1;
        elsif coalesce(v_step.status,'not_started')<>'not_applicable' then
          v_next:=coalesce(v_next,v_step.key);
          v_candidate:=public.bridge_attorney_step_to_matter_stage(v_key,v_step.key);
          if v_stage is null or public.bridge_matter_lifecycle_stage_rank(v_candidate)<public.bridge_matter_lifecycle_stage_rank(v_stage) then v_stage:=v_candidate; end if;
        end if;
        if v_step.status='blocked' then v_status:='blocked';
        elsif v_status<>'blocked' and v_step.status in ('in_progress','waiting','completed','completed_externally') then v_status:='in_progress'; end if;
      end loop;
      if v_next is null then v_status:='completed'; end if;
      v_expected:=v_expected||jsonb_build_array(jsonb_build_object('id',v_saved.id,'laneKey',v_key,'currentStage',coalesce(v_next,v_saved.current_stage),
        'status',v_status,'applicableCount',v_total,'completedCount',v_done,'notApplicableCount',v_excluded,'percent',round(100.0*v_done/nullif(v_total,0))));
      if v_saved.status is distinct from v_status or v_saved.lane_status is distinct from v_status
        or (v_next is not null and v_saved.current_stage is distinct from v_next) then
        v_issues:=v_issues||jsonb_build_array(jsonb_build_object('code','STALE_LANE_PROJECTION','severity','repair','laneKey',v_key));
      end if;
    end loop;
    for v_step in select l.process_type lane_key,s.step_key,s.status from public.transaction_subprocesses l
      join public.transaction_subprocess_steps s on s.subprocess_id=l.id
      where l.transaction_id=p_transaction_id and l.process_type in ('transfer','bond','cancellation')
      and not exists(select 1 from jsonb_array_elements(v_plan->'lanes') lp
        where lp->>'laneKey'=l.process_type and jsonb_typeof(lp->'stepKeys')='array' and (lp->'stepKeys') ? s.step_key) loop
      v_issues:=v_issues||jsonb_build_array(jsonb_build_object('code',case when v_step.status='not_started' then 'EXCLUDED_UNSTARTED_HISTORY' else 'EXCLUDED_WORKED_HISTORY' end,
        'severity',case when v_step.status='not_started' then 'info' else 'review' end,'laneKey',v_step.lane_key,'taskKey',v_step.step_key));
    end loop;
    v_stage:=coalesce(v_stage,'post_registration');
    if v_tx.current_main_stage is distinct from v_stage or v_lifecycle->>'stage' is distinct from v_stage
      or v_lifecycle->>'status' is distinct from 'active'
      or v_tx.current_sub_stage_summary is distinct from public.bridge_matter_lifecycle_stage_label(v_stage) then
      v_issues:=v_issues||jsonb_build_array(jsonb_build_object('code','STALE_MATTER_PROJECTION','severity','repair'));
    end if;
  end if;
  for v_step in select e->>'lane_key' lane_key,e->>'step_key' step_key from jsonb_array_elements(v_events) e
    where not exists(select 1 from public.transaction_subprocesses l join public.transaction_subprocess_steps s on s.subprocess_id=l.id
      where l.transaction_id=p_transaction_id and l.process_type=e->>'lane_key' and s.step_key=e->>'step_key' and s.status=e->>'status') loop
    v_issues:=v_issues||jsonb_build_array(jsonb_build_object('code','EVENT_OUTCOME_CONFLICT','severity','review','laneKey',v_step.lane_key,'taskKey',v_step.step_key));
  end loop;
  if v_revision is null or v_revision<(select coalesce(max(revision),0) from journey_private.task_events where transaction_id=p_transaction_id) then
    v_issues:=v_issues||jsonb_build_array(jsonb_build_object('code','REFRESH_REVISION_BEHIND','severity','repair'));
  end if;
  return jsonb_build_object('schemaVersion',1,'transactionId',p_transaction_id,'fingerprint',v_fingerprint,
    'revision',v_revision,'issues',v_issues,'expectedLanes',v_expected,'expectedMatterStage',v_stage,
    'decision',case when exists(select 1 from jsonb_array_elements(v_issues) i where i->>'severity'='review') then 'manual_review'
      when exists(select 1 from jsonb_array_elements(v_issues) i where i->>'severity'='repair') then 'repairable' else 'clean' end);
end;
$$;
revoke all on function journey_private.audit_matter(uuid) from public,anon,authenticated;

create function public.bridge_audit_shared_matter_journey(p_transaction_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null or not coalesce(public.bridge_can_access_transaction_spine(p_transaction_id),false)
    or not exists(select 1 from public.profiles where id=auth.uid() and role in ('attorney','conveyancer','developer','agent','internal_admin')) then
    raise exception 'Professional matter access required.' using errcode='42501'; end if;
  return journey_private.audit_matter(p_transaction_id);
end;
$$;
revoke all on function public.bridge_audit_shared_matter_journey(uuid) from public,anon;
grant execute on function public.bridge_audit_shared_matter_journey(uuid) to authenticated;

create function public.bridge_reconcile_shared_matter_journey(p_transaction_id uuid,p_expected_fingerprint text,p_command_id uuid,p_confirmation text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_report jsonb; v_after jsonb; v_lane jsonb; v_receipt journey_private.reconciliation_receipts%rowtype;
begin
  if p_command_id is null or p_confirmation is distinct from 'REBUILD_DERIVED_JOURNEY_ONLY' then
    raise exception 'Explicit projection-repair confirmation required.' using errcode='22023'; end if;
  perform public.bridge_audit_shared_matter_journey(p_transaction_id);
  -- All authorised workflow writers lock the matter first. Row locks also fence
  -- inserts through the parent foreign keys. No task or history rows are changed.
  perform 1 from public.transactions where id=p_transaction_id for update;
  perform 1 from public.transaction_subprocesses where transaction_id=p_transaction_id order by id for update;
  perform 1 from public.transaction_subprocess_steps where subprocess_id in
    (select id from public.transaction_subprocesses where transaction_id=p_transaction_id) order by id for update;
  v_report:=journey_private.audit_matter(p_transaction_id);
  if not exists(select 1 from public.profiles where id=auth.uid() and role in ('attorney','conveyancer')) then
    raise exception 'Attorney reconciliation authority required.' using errcode='42501'; end if;
  for v_lane in select value from jsonb_array_elements(v_report->'expectedLanes') loop
    if not coalesce(public.bridge_can_mutate_attorney_lane(p_transaction_id,(v_lane->>'laneKey')||'_attorney','workflow'),false) then
      raise exception 'Workflow authority required for every planned lane.' using errcode='42501'; end if;
  end loop;
  select * into v_receipt from journey_private.reconciliation_receipts where transaction_id=p_transaction_id and command_id=p_command_id;
  if found then
    if v_receipt.actor_id<>auth.uid() or v_receipt.before_fingerprint is distinct from p_expected_fingerprint then
      raise exception 'Repair command already used.' using errcode='23505'; end if;
    return v_receipt.result||jsonb_build_object('replayed',true);
  end if;
  if v_report->>'fingerprint' is distinct from p_expected_fingerprint then
    raise exception 'Matter changed since audit. Review a fresh report.' using errcode='40001'; end if;
  if v_report->>'decision'<>'repairable' then
    raise exception 'Matter is not eligible for automatic projection repair.' using errcode='22023'; end if;
  for v_lane in select value from jsonb_array_elements(v_report->'expectedLanes') loop
    update public.transaction_subprocesses set current_stage=v_lane->>'currentStage',status=v_lane->>'status',lane_status=v_lane->>'status',updated_by=auth.uid(),updated_at=now()
      where id=(v_lane->>'id')::uuid and (current_stage is distinct from v_lane->>'currentStage' or status is distinct from v_lane->>'status' or lane_status is distinct from v_lane->>'status');
  end loop;
  perform public.bridge_recompute_matter_lifecycle_from_attorney_workflows(p_transaction_id,auth.uid(),null,null);
  insert into public.transaction_refresh_signals(transaction_id,version,changed_at)
    values(p_transaction_id,(select coalesce(max(revision),0)+1 from journey_private.task_events where transaction_id=p_transaction_id),now())
    on conflict(transaction_id) do update set version=greatest(public.transaction_refresh_signals.version+1,excluded.version),changed_at=excluded.changed_at;
  v_after:=journey_private.audit_matter(p_transaction_id);
  if v_after->>'decision'<>'clean' then raise exception 'Post-repair audit failed; no changes committed.' using errcode='40001'; end if;
  v_after:=jsonb_build_object('commandId',p_command_id,'replayed',false,'beforeFingerprint',p_expected_fingerprint,'after',v_after);
  insert into journey_private.reconciliation_receipts(transaction_id,command_id,actor_id,before_fingerprint,result)
    values(p_transaction_id,p_command_id,auth.uid(),p_expected_fingerprint,v_after);
  return v_after;
end;
$$;
revoke all on function public.bridge_reconcile_shared_matter_journey(uuid,text,uuid,text) from public,anon;
grant execute on function public.bridge_reconcile_shared_matter_journey(uuid,text,uuid,text) to authenticated;
notify pgrst,'reload schema';
commit;
