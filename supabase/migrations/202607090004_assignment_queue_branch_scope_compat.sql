begin;

create or replace function public.bridge_phase6_get_or_create_queue(
  p_organization_id uuid,
  p_queue_type text,
  p_branch_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_queue_id uuid;
  v_type text := coalesce(nullif(trim(p_queue_type), ''), 'general');
  v_branch_id uuid;
begin
  if p_branch_id is not null then
    select ob.id
    into v_branch_id
    from public.organisation_branches ob
    where ob.id = p_branch_id
      and ob.organisation_id = p_organization_id
    limit 1;
  end if;

  select id
  into v_queue_id
  from public.work_queues
  where organization_id = p_organization_id
    and queue_type = v_type
    and status = 'active'
    and (
      (v_branch_id is null and branch_id is null)
      or branch_id = v_branch_id
    )
  order by branch_id nulls last, created_at asc
  limit 1;

  if v_queue_id is not null then
    return v_queue_id;
  end if;

  insert into public.work_queues (
    organization_id,
    branch_id,
    queue_name,
    queue_type,
    created_by,
    updated_by
  )
  values (
    p_organization_id,
    v_branch_id,
    public.bridge_phase6_default_queue_name(v_type),
    v_type,
    auth.uid(),
    auth.uid()
  )
  returning id into v_queue_id;

  insert into public.assignment_rules (
    organization_id,
    branch_id,
    queue_id,
    rule_name,
    rule_type,
    priority,
    active,
    created_by,
    updated_by
  )
  values (
    p_organization_id,
    v_branch_id,
    v_queue_id,
    'Manual Intake',
    'manual_queue',
    100,
    true,
    auth.uid(),
    auth.uid()
  );

  return v_queue_id;
end;
$$;

create or replace function public.bridge_phase6_enqueue_transaction(
  p_transaction_id uuid,
  p_organization_id uuid,
  p_role_type text default 'general',
  p_branch_id uuid default null,
  p_region_id uuid default null,
  p_roleplayer_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_queue_type text := public.bridge_phase6_queue_type_for_role(p_role_type);
  v_queue_id uuid;
  v_queue_branch_id uuid;
  v_metadata jsonb := coalesce(p_metadata, '{}'::jsonb);
  v_item public.work_queue_items%rowtype;
begin
  if p_transaction_id is null or p_organization_id is null then
    return jsonb_build_object('success', false, 'code', 'transaction_and_organization_required');
  end if;

  if p_branch_id is not null then
    select ob.id
    into v_queue_branch_id
    from public.organisation_branches ob
    where ob.id = p_branch_id
      and ob.organisation_id = p_organization_id
    limit 1;

    if v_queue_branch_id is null then
      v_metadata := v_metadata || jsonb_build_object('sourceBranchId', p_branch_id);
    end if;
  end if;

  v_queue_id := public.bridge_phase6_get_or_create_queue(p_organization_id, v_queue_type, v_queue_branch_id);

  insert into public.work_queue_items (
    transaction_id,
    roleplayer_id,
    queue_id,
    organization_id,
    region_id,
    branch_id,
    status,
    source_role_type,
    metadata
  )
  values (
    p_transaction_id,
    p_roleplayer_id,
    v_queue_id,
    p_organization_id,
    p_region_id,
    v_queue_branch_id,
    'waiting',
    p_role_type,
    v_metadata
  )
  on conflict (transaction_id, queue_id, coalesce(source_role_type, 'general'))
  where status <> 'cancelled'
  do update
  set roleplayer_id = coalesce(excluded.roleplayer_id, public.work_queue_items.roleplayer_id),
      region_id = coalesce(excluded.region_id, public.work_queue_items.region_id),
      branch_id = coalesce(excluded.branch_id, public.work_queue_items.branch_id),
      metadata = public.work_queue_items.metadata || excluded.metadata,
      updated_at = now()
  returning * into v_item;

  update public.transactions
  set assigned_organisation_id = coalesce(assigned_organisation_id, p_organization_id),
      assigned_region_id = coalesce(assigned_region_id, p_region_id),
      assigned_branch_id = coalesce(assigned_branch_id, v_queue_branch_id),
      assignment_status = case when assignment_status = 'completed' then assignment_status else 'queued' end,
      updated_at = now()
  where id = p_transaction_id;

  insert into public.assignment_events (
    transaction_id,
    queue_item_id,
    queue_id,
    assignment_method,
    event_type,
    actor_user_id,
    metadata
  )
  values (
    p_transaction_id,
    v_item.id,
    v_queue_id,
    'automatic',
    'work_arrived',
    auth.uid(),
    jsonb_build_object('roleType', p_role_type, 'organizationId', p_organization_id)
  );

  perform public.bridge_phase6_log_transaction_event(
    p_transaction_id,
    'WorkArrived',
    auth.uid(),
    jsonb_build_object('queueItemId', v_item.id, 'queueId', v_queue_id, 'organizationId', p_organization_id, 'roleType', p_role_type)
  );

  perform public.bridge_phase3_log_organization_event(
    p_organization_id,
    'Work Arrived',
    auth.uid(),
    null,
    null,
    p_transaction_id,
    jsonb_build_object('queueItemId', v_item.id, 'queueId', v_queue_id, 'roleType', p_role_type)
  );

  return jsonb_build_object('success', true, 'queueItem', to_jsonb(v_item));
end;
$$;

grant execute on function public.bridge_phase6_get_or_create_queue(uuid, text, uuid) to authenticated;
grant execute on function public.bridge_phase6_enqueue_transaction(uuid, uuid, text, uuid, uuid, uuid, jsonb) to authenticated;

commit;
