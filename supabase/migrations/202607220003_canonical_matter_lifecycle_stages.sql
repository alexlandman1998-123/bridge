begin;

alter table if exists public.transaction_lifecycle_workflows
  drop constraint if exists transaction_lifecycle_workflows_stage_check;

alter table if exists public.transaction_lifecycle_workflows
  add constraint transaction_lifecycle_workflows_stage_check
  check (current_stage in (
    'instruction',
    'documents',
    'finance',
    'transfer_duty',
    'lodgement',
    'registration',
    'post_registration'
  ));

alter table if exists public.transactions
  drop constraint if exists transactions_current_main_stage_check;

alter table if exists public.transactions
  add constraint transactions_current_main_stage_check
  check (current_main_stage in (
    'AVAIL', 'DEP', 'OTP', 'FIN', 'ATTY', 'XFER', 'REG',
    'instruction', 'documents', 'finance', 'transfer_duty',
    'lodgement', 'registration', 'post_registration'
  ));

create or replace function public.bridge_matter_lifecycle_stage_rank(p_stage text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case lower(coalesce(p_stage, ''))
    when 'instruction' then 10
    when 'documents' then 20
    when 'finance' then 30
    when 'transfer_duty' then 40
    when 'lodgement' then 50
    when 'registration' then 60
    when 'post_registration' then 70
    else 10
  end
$$;

create or replace function public.bridge_matter_lifecycle_stage_label(p_stage text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case lower(coalesce(p_stage, ''))
    when 'instruction' then 'Instruction'
    when 'documents' then 'Documents'
    when 'finance' then 'Finance'
    when 'transfer_duty' then 'Transfer Duty'
    when 'lodgement' then 'Lodgement'
    when 'registration' then 'Registration'
    when 'post_registration' then 'Post Registration'
    else 'Instruction'
  end
$$;

create or replace function public.bridge_attorney_step_to_matter_stage(
  p_lane_key text,
  p_step_key text
)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when lower(coalesce(p_lane_key, '')) = 'bond' then 'finance'
    when lower(coalesce(p_step_key, '')) ~ '(post.?registration|close.?out|final|handover|archive)' then 'post_registration'
    when lower(coalesce(p_step_key, '')) ~ '(registered|registration)' then 'registration'
    when lower(coalesce(p_step_key, '')) ~ '(lodg|deeds)' then 'lodgement'
    when lower(coalesce(p_step_key, '')) ~ '(rates|levy|clearance|transfer.?duty|sars|guarantee)' then 'transfer_duty'
    when lower(coalesce(p_step_key, '')) ~ '(document|search|fica|mandate|draft|sign|signature|authority)' then 'documents'
    when lower(coalesce(p_step_key, '')) ~ '(instruction|open|intake|matter)' then 'instruction'
    when lower(coalesce(p_lane_key, '')) = 'cancellation' then 'transfer_duty'
    else 'documents'
  end
$$;

create or replace function public.bridge_next_matter_stage_after(p_stage text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case lower(coalesce(p_stage, ''))
    when 'instruction' then 'documents'
    when 'documents' then 'finance'
    when 'finance' then 'transfer_duty'
    when 'transfer_duty' then 'lodgement'
    when 'lodgement' then 'registration'
    when 'registration' then 'post_registration'
    else 'post_registration'
  end
$$;

create or replace function public.bridge_recompute_matter_lifecycle_from_attorney_workflows(
  p_transaction_id uuid,
  p_actor_id uuid default null,
  p_trigger_stage text default null,
  p_trigger_status text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_transaction public.transactions%rowtype;
  v_existing_stage text;
  v_stage text;
  v_trigger_rank integer;
  v_existing_rank integer;
  v_incomplete_in_trigger_stage boolean := false;
  v_now timestamptz := now();
begin
  select *
  into v_transaction
  from public.transactions
  where id = p_transaction_id
  for update;

  if not found then
    return null;
  end if;

  if lower(coalesce(v_transaction.lifecycle_state, '')) in ('registered', 'completed', 'archived', 'cancelled', 'canceled') then
    return coalesce(
      (select current_stage from public.transaction_lifecycle_workflows where transaction_id = p_transaction_id),
      'post_registration'
    );
  end if;

  select current_stage
  into v_existing_stage
  from public.transaction_lifecycle_workflows
  where transaction_id = p_transaction_id;

  v_stage := coalesce(nullif(p_trigger_stage, ''), v_existing_stage, 'instruction');

  if nullif(p_trigger_stage, '') is not null and p_trigger_status = 'completed' then
    select exists (
      select 1
      from public.transaction_subprocess_steps step
      join public.transaction_subprocesses lane on lane.id = step.subprocess_id
      where lane.transaction_id = p_transaction_id
        and public.bridge_attorney_step_to_matter_stage(lane.process_type, step.step_key) = p_trigger_stage
        and coalesce(step.status, 'not_started') not in ('completed', 'not_required')
    )
    into v_incomplete_in_trigger_stage;

    if not v_incomplete_in_trigger_stage then
      v_stage := public.bridge_next_matter_stage_after(p_trigger_stage);
    end if;
  end if;

  v_trigger_rank := public.bridge_matter_lifecycle_stage_rank(v_stage);
  v_existing_rank := public.bridge_matter_lifecycle_stage_rank(v_existing_stage);
  if v_existing_stage is not null and v_existing_rank > v_trigger_rank then
    v_stage := v_existing_stage;
  end if;

  insert into public.transaction_lifecycle_workflows (
    transaction_id,
    current_stage,
    status,
    last_updated_by,
    last_updated_at,
    updated_at
  ) values (
    p_transaction_id,
    v_stage,
    'active',
    p_actor_id,
    v_now,
    v_now
  )
  on conflict (transaction_id) do update set
    current_stage = excluded.current_stage,
    status = excluded.status,
    last_updated_by = excluded.last_updated_by,
    last_updated_at = excluded.last_updated_at,
    updated_at = excluded.updated_at;

  update public.transactions
  set
    current_main_stage = v_stage,
    current_sub_stage_summary = public.bridge_matter_lifecycle_stage_label(v_stage),
    updated_at = v_now
  where id = p_transaction_id
    and lower(coalesce(lifecycle_state, 'active')) not in ('registered', 'completed', 'archived', 'cancelled', 'canceled');

  return v_stage;
end;
$$;

insert into public.transaction_lifecycle_workflows (
  transaction_id,
  current_stage,
  status,
  completed_at,
  last_updated_at,
  created_at,
  updated_at
)
select
  t.id,
  case
    when lower(coalesce(t.lifecycle_state, '')) in ('completed', 'archived')
      or lower(coalesce(t.stage, '')) ~ '(close.?out|handover|archive|completed)'
      then 'post_registration'
    when lower(coalesce(t.lifecycle_state, '')) = 'registered'
      or lower(coalesce(t.current_main_stage, '')) in ('reg', 'registration', 'registered')
      or lower(coalesce(t.stage, '')) ~ '(registered|registration confirmed)'
      then 'registration'
    when lower(coalesce(t.current_main_stage, '')) in ('lodgement', 'lodged')
      or lower(coalesce(t.stage, '')) ~ '(lodged|lodgement|deeds)'
      then 'lodgement'
    when lower(coalesce(t.current_main_stage, '')) in ('transfer_duty', 'xfer', 'transfer')
      or lower(coalesce(t.stage, '')) ~ '(rates|levy|clearance|transfer.?duty|sars)'
      then 'transfer_duty'
    when lower(coalesce(t.current_main_stage, '')) in ('fin', 'finance')
      or lower(coalesce(t.stage, '')) ~ '(finance|bond|approval|grant|guarantee)'
      then 'finance'
    when lower(coalesce(t.current_main_stage, '')) in ('atty', 'attorney', 'documents')
      or lower(coalesce(t.stage, '')) ~ '(document|fica|mandate|search)'
      then 'documents'
    else 'instruction'
  end,
  case
    when lower(coalesce(t.lifecycle_state, '')) in ('completed', 'registered', 'archived') then 'completed'
    else 'active'
  end,
  case
    when lower(coalesce(t.lifecycle_state, '')) in ('completed', 'registered', 'archived') then coalesce(t.completed_at, t.registered_at, t.updated_at, now())
    else null
  end,
  coalesce(t.updated_at, now()),
  now(),
  now()
from public.transactions t
where t.id is not null
on conflict (transaction_id) do update set
  current_stage = case
    when lower(coalesce(excluded.status, '')) = 'completed' then transaction_lifecycle_workflows.current_stage
    else excluded.current_stage
  end,
  status = excluded.status,
  completed_at = coalesce(transaction_lifecycle_workflows.completed_at, excluded.completed_at),
  last_updated_at = greatest(transaction_lifecycle_workflows.last_updated_at, excluded.last_updated_at),
  updated_at = now();

create or replace function public.bridge_update_attorney_workflow_step(
  p_transaction_id uuid,
  p_lane_key text,
  p_step_id uuid,
  p_status text,
  p_note text default '',
  p_visibility text default 'internal',
  p_work_packet jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_lane public.transaction_subprocesses%rowtype;
  v_step public.transaction_subprocess_steps%rowtype;
  v_lane_status text;
  v_event_type text;
  v_now timestamptz := now();
  v_attorney_role text;
  v_matter_stage text;
  v_previous_lifecycle_stage text;
  v_next_lifecycle_stage text;
begin
  if v_actor_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  if p_lane_key not in ('transfer', 'bond', 'cancellation') then
    raise exception 'Invalid attorney workflow lane.' using errcode = '22023';
  end if;

  if p_status not in ('not_started', 'in_progress', 'waiting', 'blocked', 'completed') then
    raise exception 'Invalid attorney workflow step status.' using errcode = '22023';
  end if;

  if p_visibility not in ('internal', 'professional_shared', 'client_visible') then
    raise exception 'Invalid attorney workflow visibility.' using errcode = '22023';
  end if;

  v_attorney_role := p_lane_key || '_attorney';

  if not exists (
    select 1
    from public.profiles profile
    where profile.id = v_actor_id
      and lower(coalesce(profile.role, '')) in ('attorney', 'conveyancer')
  ) then
    raise exception 'Only attorney workspace users may update legal workflow steps.' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.transaction_attorney_assignments assignment
    where assignment.transaction_id = p_transaction_id
      and lower(coalesce(assignment.assignment_status, assignment.status, 'active')) <> 'removed'
      and (
        assignment.assigned_user_id = v_actor_id
        or assignment.attorney_user_id = v_actor_id
        or assignment.primary_attorney_id = v_actor_id
        or assignment.secretary_id = v_actor_id
        or assignment.admin_handler_id = v_actor_id
        or exists (
          select 1
          from public.attorney_firm_members member
          where member.user_id = v_actor_id
            and member.status = 'active'
            and member.firm_id = coalesce(assignment.attorney_firm_id, assignment.firm_id)
        )
      )
  ) then
    raise exception 'You do not have permission to update this attorney workflow.' using errcode = '42501';
  end if;

  select lane.*
  into v_lane
  from public.transaction_subprocesses lane
  where lane.transaction_id = p_transaction_id
    and lane.process_type = p_lane_key
  for update;

  if not found then
    raise exception 'This workflow lane is not required for this transaction.' using errcode = 'P0002';
  end if;

  select step.*
  into v_step
  from public.transaction_subprocess_steps step
  where step.id = p_step_id
    and step.subprocess_id = v_lane.id
  for update;

  if not found then
    raise exception 'Workflow step not found.' using errcode = 'P0002';
  end if;

  select current_stage
  into v_previous_lifecycle_stage
  from public.transaction_lifecycle_workflows
  where transaction_id = p_transaction_id;

  update public.transaction_subprocess_steps
  set
    status = p_status,
    comment = nullif(trim(coalesce(p_note, '')), ''),
    completed_at = case when p_status = 'completed' then v_now else null end,
    completed_by = case when p_status = 'completed' then v_actor_id else null end,
    visibility_scope = p_visibility,
    updated_at = v_now
  where id = v_step.id;

  select case
    when count(*) > 0 and bool_and(step.status = 'completed') then 'completed'
    when bool_or(step.status = 'blocked') then 'blocked'
    when bool_or(step.status in ('in_progress', 'waiting', 'completed')) then 'in_progress'
    else 'not_started'
  end
  into v_lane_status
  from public.transaction_subprocess_steps step
  where step.subprocess_id = v_lane.id;

  update public.transaction_subprocesses
  set
    current_stage = v_step.step_key,
    lane_status = v_lane_status,
    status = v_lane_status,
    completed_at = case when v_lane_status = 'completed' then v_now else null end,
    updated_by = v_actor_id,
    updated_at = v_now
  where id = v_lane.id;

  v_matter_stage := public.bridge_attorney_step_to_matter_stage(p_lane_key, v_step.step_key);
  v_next_lifecycle_stage := public.bridge_recompute_matter_lifecycle_from_attorney_workflows(
    p_transaction_id,
    v_actor_id,
    v_matter_stage,
    p_status
  );

  insert into public.transaction_attorney_lane_history (
    transaction_id,
    subprocess_id,
    lane_key,
    attorney_role,
    previous_stage,
    new_stage,
    previous_status,
    new_status,
    changed_by,
    note,
    visibility,
    source,
    metadata
  ) values (
    p_transaction_id,
    v_lane.id,
    p_lane_key,
    v_attorney_role,
    v_lane.current_stage,
    v_step.step_key,
    v_step.status,
    p_status,
    v_actor_id,
    nullif(trim(coalesce(p_note, '')), ''),
    p_visibility,
    'attorney_workspace_step_atomic',
    jsonb_strip_nulls(jsonb_build_object(
      'stepId', v_step.id,
      'stepLabel', v_step.step_label,
      'workPacket', p_work_packet,
      'matterStage', v_next_lifecycle_stage,
      'previousMatterStage', v_previous_lifecycle_stage
    ))
  );

  v_event_type := case p_status
    when 'blocked' then 'AttorneyWorkflowStepBlocked'
    when 'waiting' then 'AttorneyWorkflowStepWaiting'
    when 'completed' then 'AttorneyWorkflowStepCompleted'
    else 'AttorneyWorkflowStepUpdated'
  end;

  insert into public.transaction_events (
    transaction_id,
    event_type,
    event_data,
    created_by,
    created_by_role,
    visibility_scope
  ) values (
    p_transaction_id,
    v_event_type,
    jsonb_strip_nulls(jsonb_build_object(
      'laneKey', p_lane_key,
      'attorneyRole', v_attorney_role,
      'stepId', v_step.id,
      'stepKey', v_step.step_key,
      'stepLabel', v_step.step_label,
      'status', p_status,
      'note', nullif(trim(coalesce(p_note, '')), ''),
      'workPacket', p_work_packet,
      'matterStage', v_next_lifecycle_stage,
      'previousMatterStage', v_previous_lifecycle_stage
    )),
    v_actor_id,
    'attorney',
    p_visibility
  );

  return jsonb_build_object(
    'transactionId', p_transaction_id,
    'laneId', v_lane.id,
    'laneStatus', v_lane_status,
    'stepId', v_step.id,
    'stepKey', v_step.step_key,
    'stepStatus', p_status,
    'matterStage', v_next_lifecycle_stage,
    'previousMatterStage', v_previous_lifecycle_stage,
    'eventType', v_event_type,
    'updatedAt', v_now
  );
end;
$$;

revoke all on function public.bridge_matter_lifecycle_stage_rank(text) from public;
grant execute on function public.bridge_matter_lifecycle_stage_rank(text) to authenticated, service_role;

revoke all on function public.bridge_matter_lifecycle_stage_label(text) from public;
grant execute on function public.bridge_matter_lifecycle_stage_label(text) to authenticated, service_role;

revoke all on function public.bridge_attorney_step_to_matter_stage(text, text) from public;
grant execute on function public.bridge_attorney_step_to_matter_stage(text, text) to authenticated, service_role;

revoke all on function public.bridge_next_matter_stage_after(text) from public;
grant execute on function public.bridge_next_matter_stage_after(text) to authenticated, service_role;

revoke all on function public.bridge_recompute_matter_lifecycle_from_attorney_workflows(uuid, uuid, text, text) from public;
grant execute on function public.bridge_recompute_matter_lifecycle_from_attorney_workflows(uuid, uuid, text, text) to authenticated, service_role;

revoke all on function public.bridge_update_attorney_workflow_step(uuid, text, uuid, text, text, text, jsonb) from public;
grant execute on function public.bridge_update_attorney_workflow_step(uuid, text, uuid, text, text, text, jsonb) to authenticated;

comment on table public.transaction_lifecycle_workflows is
  'Canonical parent transaction lifecycle: Instruction, Documents, Finance, Transfer Duty, Lodgement, Registration, Post Registration. Module workflows store detailed sub-statuses separately.';

comment on function public.bridge_update_attorney_workflow_step(uuid, text, uuid, text, text, text, jsonb) is
  'Atomically updates an attorney workflow step, lane rollup, matter lifecycle, transaction audit event, and compatibility stage fields.';

commit;
