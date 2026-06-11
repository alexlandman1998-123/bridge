create extension if not exists "pgcrypto";

alter table if exists public.transactions
  add column if not exists assigned_organisation_id uuid references public.organisations(id) on delete set null,
  add column if not exists assigned_region_id uuid references public.workspace_regions(id) on delete set null,
  add column if not exists assigned_branch_id uuid references public.organisation_branches(id) on delete set null,
  add column if not exists assigned_user_id uuid references auth.users(id) on delete set null,
  add column if not exists assigned_at timestamptz,
  add column if not exists assignment_status text not null default 'pending';

alter table if exists public.transactions
  drop constraint if exists transactions_phase6_assignment_status_check;
alter table if exists public.transactions
  add constraint transactions_phase6_assignment_status_check
  check (assignment_status in ('pending', 'queued', 'assigned', 'completed', 'cancelled'));

create index if not exists transactions_phase6_assignment_scope_idx
  on public.transactions (assigned_organisation_id, assigned_region_id, assigned_branch_id, assigned_user_id, assignment_status);

create table if not exists public.work_queues (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organisations(id) on delete cascade,
  branch_id uuid references public.organisation_branches(id) on delete set null,
  queue_name text not null,
  queue_type text not null,
  status text not null default 'active',
  sla_hours integer not null default 24,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint work_queues_type_check check (queue_type in ('transfer_matters', 'bond_matters', 'bond_applications', 'developments', 'commercial_matters', 'general')),
  constraint work_queues_status_check check (status in ('active', 'inactive'))
);

create unique index if not exists work_queues_org_branch_type_uidx
  on public.work_queues (organization_id, coalesce(branch_id, '00000000-0000-0000-0000-000000000000'::uuid), queue_type)
  where status = 'active';
create index if not exists work_queues_org_idx
  on public.work_queues (organization_id, status, queue_type);

create table if not exists public.assignment_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organisations(id) on delete cascade,
  branch_id uuid references public.organisation_branches(id) on delete set null,
  queue_id uuid references public.work_queues(id) on delete cascade,
  rule_name text not null,
  rule_type text not null,
  priority integer not null default 100,
  active boolean not null default true,
  config jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint assignment_rules_type_check check (rule_type in ('round_robin', 'region_based', 'branch_based', 'manual_queue', 'manager_assignment', 'capacity_based')),
  constraint assignment_rules_priority_check check (priority >= 0)
);

create index if not exists assignment_rules_queue_idx
  on public.assignment_rules (queue_id, active, priority);
create index if not exists assignment_rules_org_idx
  on public.assignment_rules (organization_id, active, priority);

create table if not exists public.work_queue_items (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  roleplayer_id uuid references public.transaction_role_players(id) on delete set null,
  queue_id uuid not null references public.work_queues(id) on delete cascade,
  organization_id uuid not null references public.organisations(id) on delete cascade,
  region_id uuid references public.workspace_regions(id) on delete set null,
  branch_id uuid references public.organisation_branches(id) on delete set null,
  assigned_user_id uuid references auth.users(id) on delete set null,
  status text not null default 'waiting',
  source_role_type text,
  assignment_method text,
  assignment_rule_id uuid references public.assignment_rules(id) on delete set null,
  arrived_at timestamptz not null default now(),
  assigned_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint work_queue_items_status_check check (status in ('waiting', 'assigned', 'completed', 'cancelled')),
  constraint work_queue_items_assignment_method_check check (assignment_method is null or assignment_method in ('manual', 'automatic', 'round_robin', 'region_based', 'branch_based', 'manager_assignment', 'capacity_based'))
);

create unique index if not exists work_queue_items_transaction_queue_role_uidx
  on public.work_queue_items (transaction_id, queue_id, coalesce(source_role_type, 'general'))
  where status <> 'cancelled';
create index if not exists work_queue_items_queue_status_idx
  on public.work_queue_items (queue_id, status, arrived_at);
create index if not exists work_queue_items_assigned_user_idx
  on public.work_queue_items (assigned_user_id, status)
  where assigned_user_id is not null;
create index if not exists work_queue_items_scope_idx
  on public.work_queue_items (organization_id, region_id, branch_id, status);

create table if not exists public.assignment_events (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid references public.transactions(id) on delete cascade,
  queue_item_id uuid references public.work_queue_items(id) on delete cascade,
  queue_id uuid references public.work_queues(id) on delete set null,
  assigned_user_id uuid references auth.users(id) on delete set null,
  previous_user_id uuid references auth.users(id) on delete set null,
  assignment_method text not null default 'manual',
  event_type text not null default 'assigned',
  actor_user_id uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint assignment_events_method_check check (assignment_method in ('manual', 'automatic', 'round_robin', 'region_based', 'branch_based', 'manager_assignment', 'capacity_based')),
  constraint assignment_events_type_check check (event_type in ('work_arrived', 'assigned', 'reassigned', 'completed', 'sla_warning'))
);

create index if not exists assignment_events_transaction_idx
  on public.assignment_events (transaction_id, created_at desc);
create index if not exists assignment_events_queue_idx
  on public.assignment_events (queue_id, created_at desc);
create index if not exists assignment_events_user_idx
  on public.assignment_events (assigned_user_id, created_at desc)
  where assigned_user_id is not null;

create or replace function public.bridge_phase6_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists work_queues_phase6_touch on public.work_queues;
create trigger work_queues_phase6_touch
before update on public.work_queues
for each row execute function public.bridge_phase6_touch_updated_at();

drop trigger if exists assignment_rules_phase6_touch on public.assignment_rules;
create trigger assignment_rules_phase6_touch
before update on public.assignment_rules
for each row execute function public.bridge_phase6_touch_updated_at();

drop trigger if exists work_queue_items_phase6_touch on public.work_queue_items;
create trigger work_queue_items_phase6_touch
before update on public.work_queue_items
for each row execute function public.bridge_phase6_touch_updated_at();

create or replace function public.bridge_phase6_queue_type_for_role(p_role_type text)
returns text
language sql
immutable
as $$
  select case
    when lower(coalesce(p_role_type, '')) in ('transfer_attorney', 'conveyancer', 'attorney') then 'transfer_matters'
    when lower(coalesce(p_role_type, '')) in ('bond_attorney') then 'bond_matters'
    when lower(coalesce(p_role_type, '')) in ('bond_originator', 'bond_consultant') then 'bond_applications'
    when lower(coalesce(p_role_type, '')) in ('developer', 'developer_contact') then 'developments'
    else 'general'
  end
$$;

create or replace function public.bridge_phase6_default_queue_name(p_queue_type text)
returns text
language sql
immutable
as $$
  select case
    when p_queue_type = 'transfer_matters' then 'Transfer Matters'
    when p_queue_type = 'bond_matters' then 'Bond Matters'
    when p_queue_type = 'bond_applications' then 'Bond Applications'
    when p_queue_type = 'developments' then 'Developments'
    when p_queue_type = 'commercial_matters' then 'Commercial Matters'
    else 'General Work'
  end
$$;

create or replace function public.bridge_phase6_can_manage_queue(p_organization_id uuid, p_branch_id uuid default null)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.bridge_phase5_can_manage_hierarchy(p_organization_id) then
    return true;
  end if;
  if p_branch_id is not null and public.bridge_phase5_can_manage_branch(p_organization_id, p_branch_id) then
    return true;
  end if;
  return false;
end;
$$;

create or replace function public.bridge_phase6_can_access_queue(p_organization_id uuid, p_branch_id uuid default null, p_assigned_user_id uuid default null)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_assigned_user_id is not null and p_assigned_user_id = auth.uid() then
    return true;
  end if;
  if public.bridge_phase5_can_manage_hierarchy(p_organization_id) then
    return true;
  end if;
  if p_branch_id is not null and public.bridge_phase5_can_manage_branch(p_organization_id, p_branch_id) then
    return true;
  end if;
  return exists (
    select 1
    from public.organisation_users ou
    where ou.organisation_id = p_organization_id
      and ou.user_id = auth.uid()
      and coalesce(ou.membership_status, ou.status) = 'active'
      and (
        coalesce(ou.primary_branch_id, ou.branch_id) = p_branch_id
        or p_branch_id is null
      )
  );
end;
$$;

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
begin
  select id
  into v_queue_id
  from public.work_queues
  where organization_id = p_organization_id
    and queue_type = v_type
    and status = 'active'
    and (
      (p_branch_id is null and branch_id is null)
      or branch_id = p_branch_id
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
    p_branch_id,
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
    p_branch_id,
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

create or replace function public.bridge_phase6_log_transaction_event(
  p_transaction_id uuid,
  p_event_type text,
  p_actor_user_id uuid default null,
  p_event_data jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_transaction_id is null or to_regclass('public.transaction_events') is null then
    return;
  end if;

  insert into public.transaction_events (
    transaction_id,
    event_type,
    created_by,
    event_data,
    visibility_scope
  )
  values (
    p_transaction_id,
    p_event_type,
    p_actor_user_id,
    coalesce(p_event_data, '{}'::jsonb),
    'internal'
  );
exception
  when undefined_column or check_violation then
    return;
end;
$$;

create or replace function public.bridge_phase6_create_queue(
  p_organization_id uuid,
  p_queue jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_branch_id uuid := nullif(p_queue->>'branchId', '')::uuid;
  v_queue_type text := coalesce(nullif(p_queue->>'queueType', ''), 'general');
  v_queue public.work_queues%rowtype;
begin
  if not public.bridge_phase6_can_manage_queue(p_organization_id, v_branch_id) then
    return jsonb_build_object('success', false, 'code', 'not_authorized');
  end if;

  if v_branch_id is not null and not exists (
    select 1 from public.organisation_branches where id = v_branch_id and organisation_id = p_organization_id
  ) then
    return jsonb_build_object('success', false, 'code', 'branch_not_found');
  end if;

  insert into public.work_queues (
    organization_id,
    branch_id,
    queue_name,
    queue_type,
    sla_hours,
    created_by,
    updated_by
  )
  values (
    p_organization_id,
    v_branch_id,
    coalesce(nullif(trim(p_queue->>'queueName'), ''), public.bridge_phase6_default_queue_name(v_queue_type)),
    v_queue_type,
    greatest(coalesce((p_queue->>'slaHours')::integer, 24), 1),
    v_actor,
    v_actor
  )
  on conflict (organization_id, coalesce(branch_id, '00000000-0000-0000-0000-000000000000'::uuid), queue_type)
  where status = 'active'
  do update
  set queue_name = excluded.queue_name,
      sla_hours = excluded.sla_hours,
      updated_by = v_actor,
      updated_at = now()
  returning * into v_queue;

  perform public.bridge_phase3_log_organization_event(
    p_organization_id,
    'Queue Created',
    v_actor,
    null,
    null,
    null,
    jsonb_build_object('queueId', v_queue.id, 'queueType', v_queue.queue_type, 'branchId', v_queue.branch_id)
  );

  return jsonb_build_object('success', true, 'queue', to_jsonb(v_queue));
end;
$$;

create or replace function public.bridge_phase6_upsert_assignment_rule(
  p_organization_id uuid,
  p_rule jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_rule_id uuid := nullif(p_rule->>'id', '')::uuid;
  v_queue_id uuid := nullif(p_rule->>'queueId', '')::uuid;
  v_branch_id uuid := nullif(p_rule->>'branchId', '')::uuid;
  v_rule_type text := coalesce(nullif(p_rule->>'ruleType', ''), 'manual_queue');
  v_rule public.assignment_rules%rowtype;
begin
  if v_queue_id is null then
    return jsonb_build_object('success', false, 'code', 'queue_required');
  end if;

  select branch_id into v_branch_id
  from public.work_queues
  where id = v_queue_id
    and organization_id = p_organization_id;

  if not public.bridge_phase6_can_manage_queue(p_organization_id, v_branch_id) then
    return jsonb_build_object('success', false, 'code', 'not_authorized');
  end if;

  if v_rule_id is null then
    insert into public.assignment_rules (
      organization_id,
      branch_id,
      queue_id,
      rule_name,
      rule_type,
      priority,
      active,
      config,
      created_by,
      updated_by
    )
    values (
      p_organization_id,
      v_branch_id,
      v_queue_id,
      coalesce(nullif(trim(p_rule->>'ruleName'), ''), initcap(replace(v_rule_type, '_', ' '))),
      v_rule_type,
      coalesce((p_rule->>'priority')::integer, 100),
      coalesce((p_rule->>'active')::boolean, true),
      coalesce(p_rule->'config', '{}'::jsonb),
      v_actor,
      v_actor
    )
    returning * into v_rule;
  else
    update public.assignment_rules
    set rule_name = coalesce(nullif(trim(p_rule->>'ruleName'), ''), rule_name),
        rule_type = v_rule_type,
        priority = coalesce((p_rule->>'priority')::integer, priority),
        active = coalesce((p_rule->>'active')::boolean, active),
        config = coalesce(p_rule->'config', config),
        updated_by = v_actor,
        updated_at = now()
    where id = v_rule_id
      and organization_id = p_organization_id
    returning * into v_rule;
  end if;

  if v_rule.id is null then
    return jsonb_build_object('success', false, 'code', 'rule_not_found');
  end if;

  perform public.bridge_phase3_log_organization_event(
    p_organization_id,
    'Assignment Rule Updated',
    v_actor,
    null,
    null,
    null,
    jsonb_build_object('ruleId', v_rule.id, 'queueId', v_rule.queue_id, 'ruleType', v_rule.rule_type)
  );

  return jsonb_build_object('success', true, 'rule', to_jsonb(v_rule));
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
  v_item public.work_queue_items%rowtype;
begin
  if p_transaction_id is null or p_organization_id is null then
    return jsonb_build_object('success', false, 'code', 'transaction_and_organization_required');
  end if;

  v_queue_id := public.bridge_phase6_get_or_create_queue(p_organization_id, v_queue_type, p_branch_id);

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
    p_branch_id,
    'waiting',
    p_role_type,
    coalesce(p_metadata, '{}'::jsonb)
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
      assigned_branch_id = coalesce(assigned_branch_id, p_branch_id),
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

create or replace function public.bridge_phase6_choose_assignee(
  p_queue_id uuid,
  p_rule_type text default 'capacity_based'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_queue public.work_queues%rowtype;
  v_user_id uuid;
begin
  select * into v_queue from public.work_queues where id = p_queue_id;
  if v_queue.id is null then
    return null;
  end if;

  if p_rule_type = 'round_robin' then
    select bm.user_id
    into v_user_id
    from public.branch_members bm
    where bm.status = 'active'
      and (v_queue.branch_id is null or bm.branch_id = v_queue.branch_id)
      and exists (
        select 1
        from public.organisation_users ou
        where ou.user_id = bm.user_id
          and ou.organisation_id = v_queue.organization_id
          and coalesce(ou.membership_status, ou.status) = 'active'
      )
    order by (
      select coalesce(max(ae.created_at), 'epoch'::timestamptz)
      from public.assignment_events ae
      join public.work_queue_items item on item.id = ae.queue_item_id
      where item.organization_id = v_queue.organization_id
        and ae.assigned_user_id = bm.user_id
        and ae.event_type in ('assigned', 'reassigned')
    ) asc,
    bm.joined_at asc nulls last,
    bm.created_at asc
    limit 1;
  else
    select candidate.user_id
    into v_user_id
    from (
      select
        bm.user_id,
        count(item.id) filter (where item.status = 'assigned') as active_work
      from public.branch_members bm
      left join public.work_queue_items item on item.assigned_user_id = bm.user_id and item.status = 'assigned'
      where bm.status = 'active'
        and (v_queue.branch_id is null or bm.branch_id = v_queue.branch_id)
        and exists (
          select 1
          from public.organisation_users ou
          where ou.user_id = bm.user_id
            and ou.organisation_id = v_queue.organization_id
            and coalesce(ou.membership_status, ou.status) = 'active'
        )
      group by bm.user_id
    ) candidate
    order by candidate.active_work asc, candidate.user_id asc
    limit 1;
  end if;

  return v_user_id;
end;
$$;

create or replace function public.bridge_phase6_assign_queue_item(
  p_queue_item_id uuid,
  p_assigned_user_id uuid default null,
  p_assignment_method text default 'manual'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_item public.work_queue_items%rowtype;
  v_queue public.work_queues%rowtype;
  v_previous_user_id uuid;
  v_user_id uuid := p_assigned_user_id;
  v_method text := coalesce(nullif(p_assignment_method, ''), 'manual');
begin
  select * into v_item from public.work_queue_items where id = p_queue_item_id;
  if v_item.id is null then
    return jsonb_build_object('success', false, 'code', 'queue_item_not_found');
  end if;

  select * into v_queue from public.work_queues where id = v_item.queue_id;
  if not public.bridge_phase6_can_manage_queue(v_item.organization_id, v_item.branch_id) then
    return jsonb_build_object('success', false, 'code', 'not_authorized');
  end if;

  if v_user_id is null then
    v_method := coalesce((
      select rule_type
      from public.assignment_rules
      where queue_id = v_item.queue_id
        and active = true
        and rule_type <> 'manual_queue'
      order by priority asc, created_at asc
      limit 1
    ), 'capacity_based');
    v_user_id := public.bridge_phase6_choose_assignee(v_item.queue_id, v_method);
  end if;

  if v_user_id is null then
    return jsonb_build_object('success', false, 'code', 'no_available_assignee');
  end if;

  if not exists (
    select 1
    from public.organisation_users ou
    where ou.organisation_id = v_item.organization_id
      and ou.user_id = v_user_id
      and coalesce(ou.membership_status, ou.status) = 'active'
  ) then
    return jsonb_build_object('success', false, 'code', 'assignee_not_member');
  end if;

  v_previous_user_id := v_item.assigned_user_id;

  update public.work_queue_items
  set assigned_user_id = v_user_id,
      status = 'assigned',
      assignment_method = v_method,
      assigned_at = coalesce(assigned_at, now()),
      updated_at = now()
  where id = p_queue_item_id
  returning * into v_item;

  update public.transactions
  set assigned_organisation_id = v_item.organization_id,
      assigned_region_id = coalesce(v_item.region_id, assigned_region_id),
      assigned_branch_id = coalesce(v_item.branch_id, assigned_branch_id),
      assigned_user_id = v_user_id,
      assigned_at = coalesce(assigned_at, now()),
      assignment_status = 'assigned',
      updated_at = now()
  where id = v_item.transaction_id;

  if v_item.roleplayer_id is not null then
    update public.transaction_role_players
    set assigned_user_id = v_user_id,
        assignment_status = 'active',
        status = 'active',
        updated_at = now()
    where id = v_item.roleplayer_id;
  end if;

  insert into public.assignment_events (
    transaction_id,
    queue_item_id,
    queue_id,
    assigned_user_id,
    previous_user_id,
    assignment_method,
    event_type,
    actor_user_id,
    metadata
  )
  values (
    v_item.transaction_id,
    v_item.id,
    v_item.queue_id,
    v_user_id,
    v_previous_user_id,
    case when v_method in ('manual', 'round_robin', 'region_based', 'branch_based', 'manager_assignment', 'capacity_based') then v_method else 'automatic' end,
    case when v_previous_user_id is null then 'assigned' else 'reassigned' end,
    v_actor,
    jsonb_build_object('queueId', v_item.queue_id, 'queueType', v_queue.queue_type)
  );

  perform public.bridge_phase6_log_transaction_event(
    v_item.transaction_id,
    case when v_previous_user_id is null then 'WorkAssigned' else 'WorkReassigned' end,
    v_actor,
    jsonb_build_object('queueItemId', v_item.id, 'queueId', v_item.queue_id, 'assignedUserId', v_user_id, 'previousUserId', v_previous_user_id)
  );

  perform public.bridge_phase3_log_organization_event(
    v_item.organization_id,
    case when v_previous_user_id is null then 'Work Assigned' else 'Work Reassigned' end,
    v_actor,
    v_user_id,
    null,
    v_item.transaction_id,
    jsonb_build_object('queueItemId', v_item.id, 'queueId', v_item.queue_id, 'previousUserId', v_previous_user_id)
  );

  return jsonb_build_object('success', true, 'queueItem', to_jsonb(v_item));
end;
$$;

create or replace function public.bridge_phase6_complete_queue_item(
  p_queue_item_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_item public.work_queue_items%rowtype;
begin
  select * into v_item from public.work_queue_items where id = p_queue_item_id;
  if v_item.id is null then
    return jsonb_build_object('success', false, 'code', 'queue_item_not_found');
  end if;
  if not public.bridge_phase6_can_manage_queue(v_item.organization_id, v_item.branch_id)
    and v_item.assigned_user_id <> auth.uid() then
    return jsonb_build_object('success', false, 'code', 'not_authorized');
  end if;

  update public.work_queue_items
  set status = 'completed',
      completed_at = coalesce(completed_at, now()),
      updated_at = now()
  where id = p_queue_item_id
  returning * into v_item;

  update public.transactions
  set assignment_status = 'completed',
      updated_at = now()
  where id = v_item.transaction_id;

  insert into public.assignment_events (
    transaction_id,
    queue_item_id,
    queue_id,
    assigned_user_id,
    assignment_method,
    event_type,
    actor_user_id
  )
  values (
    v_item.transaction_id,
    v_item.id,
    v_item.queue_id,
    v_item.assigned_user_id,
    coalesce(v_item.assignment_method, 'manual'),
    'completed',
    v_actor
  );

  perform public.bridge_phase6_log_transaction_event(
    v_item.transaction_id,
    'WorkCompleted',
    v_actor,
    jsonb_build_object('queueItemId', v_item.id, 'queueId', v_item.queue_id)
  );

  return jsonb_build_object('success', true, 'queueItem', to_jsonb(v_item));
end;
$$;

create or replace function public.bridge_phase6_list_queue_dashboard(
  p_organization_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_scope record;
  v_queues jsonb := '[]'::jsonb;
  v_items jsonb := '[]'::jsonb;
  v_rules jsonb := '[]'::jsonb;
  v_users jsonb := '[]'::jsonb;
begin
  select * into v_scope from public.bridge_phase5_membership_scope(p_organization_id) limit 1;
  if not found then
    return jsonb_build_object('success', false, 'code', 'not_authorized');
  end if;

  select coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.queue_name), '[]'::jsonb)
  into v_queues
  from (
    select
      q.*,
      ob.name as branch_name,
      count(item.id) filter (where item.status = 'waiting')::integer as waiting_count,
      count(item.id) filter (where item.status = 'assigned')::integer as assigned_count,
      count(item.id) filter (where item.status = 'completed')::integer as completed_count,
      count(item.id) filter (where item.status = 'waiting' and item.arrived_at < now() - make_interval(hours => q.sla_hours))::integer as sla_warning_count,
      avg(extract(epoch from (coalesce(item.assigned_at, now()) - item.arrived_at)) / 60) filter (where item.assigned_at is not null)::numeric(12,2) as average_assignment_minutes
    from public.work_queues q
    left join public.organisation_branches ob on ob.id = q.branch_id
    left join public.work_queue_items item on item.queue_id = q.id
    where q.organization_id = p_organization_id
      and q.status = 'active'
      and (
        v_scope.can_manage_hierarchy
        or q.branch_id is null
        or public.bridge_phase6_can_access_queue(q.organization_id, q.branch_id, null)
      )
    group by q.id, ob.name
  ) row_data;

  select coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.arrived_at desc), '[]'::jsonb)
  into v_items
  from (
    select
      item.*,
      q.queue_name,
      q.queue_type,
      ob.name as branch_name,
      p.full_name as assigned_user_name,
      tx.transaction_reference,
      tx.matter_number,
      tx.property_address_line_1,
      tx.suburb,
      tx.city
    from public.work_queue_items item
    join public.work_queues q on q.id = item.queue_id
    left join public.organisation_branches ob on ob.id = item.branch_id
    left join public.profiles p on p.id = item.assigned_user_id
    left join public.transactions tx on tx.id = item.transaction_id
    where item.organization_id = p_organization_id
      and item.status in ('waiting', 'assigned')
      and public.bridge_phase6_can_access_queue(item.organization_id, item.branch_id, item.assigned_user_id)
    order by item.arrived_at desc
    limit 100
  ) row_data;

  select coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.priority asc), '[]'::jsonb)
  into v_rules
  from (
    select rule.*
    from public.assignment_rules rule
    join public.work_queues q on q.id = rule.queue_id
    where rule.organization_id = p_organization_id
      and public.bridge_phase6_can_access_queue(q.organization_id, q.branch_id, null)
  ) row_data;

  select coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.full_name), '[]'::jsonb)
  into v_users
  from (
    select
      ou.user_id,
      coalesce(p.full_name, trim(concat(coalesce(ou.first_name, ''), ' ', coalesce(ou.last_name, ''))), ou.email) as full_name,
      ou.email,
      coalesce(ou.primary_branch_id, ou.branch_id) as branch_id,
      ob.name as branch_name,
      count(item.id) filter (where item.status = 'assigned')::integer as active_work_count
    from public.organisation_users ou
    left join public.profiles p on p.id = ou.user_id
    left join public.organisation_branches ob on ob.id = coalesce(ou.primary_branch_id, ou.branch_id)
    left join public.work_queue_items item on item.assigned_user_id = ou.user_id and item.status = 'assigned'
    where ou.organisation_id = p_organization_id
      and coalesce(ou.membership_status, ou.status) = 'active'
      and (
        v_scope.can_manage_hierarchy
        or public.bridge_phase6_can_access_queue(p_organization_id, coalesce(ou.primary_branch_id, ou.branch_id), ou.user_id)
      )
    group by ou.user_id, p.full_name, ou.first_name, ou.last_name, ou.email, coalesce(ou.primary_branch_id, ou.branch_id), ob.name
  ) row_data;

  return jsonb_build_object(
    'success', true,
    'scope', to_jsonb(v_scope),
    'queues', v_queues,
    'items', v_items,
    'rules', v_rules,
    'users', v_users,
    'canManageQueues', coalesce(v_scope.can_manage_hierarchy, false) or coalesce(v_scope.can_manage_region, false) or coalesce(v_scope.can_manage_branch, false)
  );
end;
$$;

create or replace function public.bridge_phase6_enqueue_roleplayer_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
begin
  v_org_id := coalesce(new.assigned_organisation_id, new.organisation_id);
  if v_org_id is null or new.transaction_id is null then
    return new;
  end if;

  if tg_op = 'UPDATE'
    and coalesce(old.assigned_organisation_id, old.organisation_id) = v_org_id
    and coalesce(old.assigned_branch_id, old.branch_id) is not distinct from coalesce(new.assigned_branch_id, new.branch_id)
    and old.assignment_status is not distinct from new.assignment_status then
    return new;
  end if;

  perform public.bridge_phase6_enqueue_transaction(
    new.transaction_id,
    v_org_id,
    new.role_type,
    coalesce(new.assigned_branch_id, new.branch_id),
    new.assigned_region_id,
    new.id,
    jsonb_build_object('source', 'transaction_role_players_trigger', 'selectionSource', new.selection_source)
  );
  return new;
end;
$$;

drop trigger if exists transaction_role_players_phase6_enqueue on public.transaction_role_players;
create trigger transaction_role_players_phase6_enqueue
after insert or update of assigned_organisation_id, organisation_id, assigned_branch_id, branch_id, assigned_region_id, assignment_status
on public.transaction_role_players
for each row
execute function public.bridge_phase6_enqueue_roleplayer_trigger();

alter table public.work_queues enable row level security;
alter table public.assignment_rules enable row level security;
alter table public.work_queue_items enable row level security;
alter table public.assignment_events enable row level security;

drop policy if exists work_queues_select_phase6_scope on public.work_queues;
create policy work_queues_select_phase6_scope
on public.work_queues for select to authenticated
using (public.bridge_phase6_can_access_queue(organization_id, branch_id, null));

drop policy if exists work_queues_insert_phase6_scope on public.work_queues;
create policy work_queues_insert_phase6_scope
on public.work_queues for insert to authenticated
with check (public.bridge_phase6_can_manage_queue(organization_id, branch_id));

drop policy if exists work_queues_update_phase6_scope on public.work_queues;
create policy work_queues_update_phase6_scope
on public.work_queues for update to authenticated
using (public.bridge_phase6_can_manage_queue(organization_id, branch_id))
with check (public.bridge_phase6_can_manage_queue(organization_id, branch_id));

drop policy if exists assignment_rules_select_phase6_scope on public.assignment_rules;
create policy assignment_rules_select_phase6_scope
on public.assignment_rules for select to authenticated
using (public.bridge_phase6_can_access_queue(organization_id, branch_id, null));

drop policy if exists assignment_rules_insert_phase6_scope on public.assignment_rules;
create policy assignment_rules_insert_phase6_scope
on public.assignment_rules for insert to authenticated
with check (public.bridge_phase6_can_manage_queue(organization_id, branch_id));

drop policy if exists assignment_rules_update_phase6_scope on public.assignment_rules;
create policy assignment_rules_update_phase6_scope
on public.assignment_rules for update to authenticated
using (public.bridge_phase6_can_manage_queue(organization_id, branch_id))
with check (public.bridge_phase6_can_manage_queue(organization_id, branch_id));

drop policy if exists work_queue_items_select_phase6_scope on public.work_queue_items;
create policy work_queue_items_select_phase6_scope
on public.work_queue_items for select to authenticated
using (public.bridge_phase6_can_access_queue(organization_id, branch_id, assigned_user_id));

drop policy if exists work_queue_items_insert_phase6_scope on public.work_queue_items;
create policy work_queue_items_insert_phase6_scope
on public.work_queue_items for insert to authenticated
with check (public.bridge_phase6_can_manage_queue(organization_id, branch_id));

drop policy if exists work_queue_items_update_phase6_scope on public.work_queue_items;
create policy work_queue_items_update_phase6_scope
on public.work_queue_items for update to authenticated
using (public.bridge_phase6_can_manage_queue(organization_id, branch_id) or assigned_user_id = auth.uid())
with check (public.bridge_phase6_can_manage_queue(organization_id, branch_id) or assigned_user_id = auth.uid());

drop policy if exists assignment_events_select_phase6_scope on public.assignment_events;
create policy assignment_events_select_phase6_scope
on public.assignment_events for select to authenticated
using (
  exists (
    select 1
    from public.work_queue_items item
    where item.id = assignment_events.queue_item_id
      and public.bridge_phase6_can_access_queue(item.organization_id, item.branch_id, item.assigned_user_id)
  )
);

grant select, insert, update on public.work_queues to authenticated;
grant select, insert, update on public.assignment_rules to authenticated;
grant select, insert, update on public.work_queue_items to authenticated;
grant select, insert on public.assignment_events to authenticated;
grant execute on function public.bridge_phase6_can_manage_queue(uuid, uuid) to authenticated;
grant execute on function public.bridge_phase6_can_access_queue(uuid, uuid, uuid) to authenticated;
grant execute on function public.bridge_phase6_get_or_create_queue(uuid, text, uuid) to authenticated;
grant execute on function public.bridge_phase6_create_queue(uuid, jsonb) to authenticated;
grant execute on function public.bridge_phase6_upsert_assignment_rule(uuid, jsonb) to authenticated;
grant execute on function public.bridge_phase6_enqueue_transaction(uuid, uuid, text, uuid, uuid, uuid, jsonb) to authenticated;
grant execute on function public.bridge_phase6_choose_assignee(uuid, text) to authenticated;
grant execute on function public.bridge_phase6_assign_queue_item(uuid, uuid, text) to authenticated;
grant execute on function public.bridge_phase6_complete_queue_item(uuid) to authenticated;
grant execute on function public.bridge_phase6_list_queue_dashboard(uuid) to authenticated;
