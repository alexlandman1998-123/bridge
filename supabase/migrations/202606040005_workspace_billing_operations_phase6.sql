begin;

create table if not exists public.workspace_plan_change_requests (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  current_plan_key text references public.workspace_plan_catalog(plan_key),
  requested_plan_key text not null references public.workspace_plan_catalog(plan_key),
  status text not null default 'pending',
  note text,
  requested_by uuid,
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workspace_plan_change_requests_status_check check (status in ('pending', 'approved', 'rejected', 'canceled'))
);

create table if not exists public.workspace_billing_events (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  subscription_id uuid references public.workspace_subscriptions(id) on delete set null,
  request_id uuid references public.workspace_plan_change_requests(id) on delete set null,
  event_type text not null,
  actor_user_id uuid,
  previous_plan_key text,
  next_plan_key text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists workspace_plan_change_requests_one_pending_idx
  on public.workspace_plan_change_requests (organisation_id)
  where status = 'pending';

create index if not exists workspace_plan_change_requests_org_status_idx
  on public.workspace_plan_change_requests (organisation_id, status, created_at desc);

create index if not exists workspace_billing_events_org_created_idx
  on public.workspace_billing_events (organisation_id, created_at desc);

create or replace function public.bridge_is_workspace_billing_admin(p_organisation_id uuid, p_user_id uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.organisation_users ou
    where ou.organisation_id = p_organisation_id
      and ou.user_id = p_user_id
      and lower(coalesce(ou.status, 'active')) = 'active'
      and lower(coalesce(ou.organisation_role, ou.workspace_role, ou.role, '')) in (
        'owner',
        'principal',
        'super_admin',
        'admin',
        'director'
      )
  )
$$;

create or replace function public.bridge_is_platform_billing_operator(p_user_id uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = p_user_id
      and lower(coalesce(p.role, '')) in ('developer', 'super_admin', 'internal_admin')
  )
$$;

create or replace function public.bridge_log_workspace_billing_event(
  p_organisation_id uuid,
  p_subscription_id uuid,
  p_request_id uuid,
  p_event_type text,
  p_actor_user_id uuid,
  p_previous_plan_key text,
  p_next_plan_key text,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_id uuid;
begin
  insert into public.workspace_billing_events (
    organisation_id,
    subscription_id,
    request_id,
    event_type,
    actor_user_id,
    previous_plan_key,
    next_plan_key,
    metadata
  )
  values (
    p_organisation_id,
    p_subscription_id,
    p_request_id,
    p_event_type,
    p_actor_user_id,
    p_previous_plan_key,
    p_next_plan_key,
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into v_event_id;

  return v_event_id;
end;
$$;

create or replace function public.bridge_request_workspace_plan_change(
  p_organisation_id uuid,
  p_plan_key text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_plan public.workspace_plan_catalog%rowtype;
  v_subscription public.workspace_subscriptions%rowtype;
  v_request public.workspace_plan_change_requests%rowtype;
begin
  if v_actor is null then
    raise exception 'Authentication is required to request a plan change.' using errcode = '28000';
  end if;

  if not public.bridge_is_workspace_billing_admin(p_organisation_id, v_actor) then
    raise exception 'You do not have permission to request billing changes for this workspace.' using errcode = '42501';
  end if;

  select * into v_plan
  from public.workspace_plan_catalog
  where plan_key = lower(coalesce(p_plan_key, ''))
    and active = true;

  if not found then
    raise exception 'Requested workspace plan does not exist or is inactive.' using errcode = '22023';
  end if;

  select * into v_subscription
  from public.workspace_subscriptions
  where organisation_id = p_organisation_id;

  if not found then
    raise exception 'Workspace subscription is not available yet.' using errcode = '22023';
  end if;

  insert into public.workspace_plan_change_requests (
    organisation_id,
    current_plan_key,
    requested_plan_key,
    status,
    note,
    requested_by,
    metadata
  )
  values (
    p_organisation_id,
    v_subscription.plan_key,
    v_plan.plan_key,
    'pending',
    nullif(trim(coalesce(p_note, '')), ''),
    v_actor,
    jsonb_build_object(
      'source', 'billing_settings',
      'currentPlanName', v_subscription.plan_name,
      'requestedPlanName', v_plan.plan_name
    )
  )
  on conflict (organisation_id) where status = 'pending'
  do update set
    current_plan_key = excluded.current_plan_key,
    requested_plan_key = excluded.requested_plan_key,
    note = excluded.note,
    requested_by = excluded.requested_by,
    metadata = excluded.metadata,
    updated_at = now()
  returning * into v_request;

  perform public.bridge_log_workspace_billing_event(
    p_organisation_id,
    v_subscription.id,
    v_request.id,
    'plan_change_requested',
    v_actor,
    v_subscription.plan_key,
    v_plan.plan_key,
    jsonb_build_object('note', nullif(trim(coalesce(p_note, '')), ''))
  );

  return jsonb_build_object(
    'id', v_request.id,
    'organisationId', v_request.organisation_id,
    'currentPlanKey', v_request.current_plan_key,
    'requestedPlanKey', v_request.requested_plan_key,
    'status', v_request.status,
    'createdAt', v_request.created_at,
    'updatedAt', v_request.updated_at
  );
end;
$$;

create or replace function public.bridge_apply_workspace_plan_change(
  p_request_id uuid,
  p_review_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_request public.workspace_plan_change_requests%rowtype;
  v_plan public.workspace_plan_catalog%rowtype;
  v_subscription public.workspace_subscriptions%rowtype;
  v_previous_plan_key text;
begin
  if v_actor is null then
    raise exception 'Authentication is required to apply a plan change.' using errcode = '28000';
  end if;

  if not public.bridge_is_platform_billing_operator(v_actor) then
    raise exception 'Only platform billing operators can apply plan changes.' using errcode = '42501';
  end if;

  select * into v_request
  from public.workspace_plan_change_requests
  where id = p_request_id
    and status = 'pending'
  for update;

  if not found then
    raise exception 'Pending plan change request was not found.' using errcode = '22023';
  end if;

  select * into v_plan
  from public.workspace_plan_catalog
  where plan_key = v_request.requested_plan_key
    and active = true;

  if not found then
    raise exception 'Requested workspace plan does not exist or is inactive.' using errcode = '22023';
  end if;

  select * into v_subscription
  from public.workspace_subscriptions
  where organisation_id = v_request.organisation_id
  for update;

  if not found then
    raise exception 'Workspace subscription is not available yet.' using errcode = '22023';
  end if;

  v_previous_plan_key := v_subscription.plan_key;

  update public.workspace_subscriptions
  set
    plan_key = v_plan.plan_key,
    plan_name = v_plan.plan_name,
    description = v_plan.description,
    status = 'active',
    billing_cycle = case when v_plan.billing_model = 'contract' then 'contract' when v_plan.billing_model = 'trial' then 'none' else 'monthly' end,
    monthly_amount = v_plan.monthly_amount,
    trial_ends_at = null,
    current_period_starts_at = now(),
    current_period_ends_at = case when v_plan.billing_model = 'contract' then null else now() + interval '1 month' end,
    entitlements = v_plan.default_entitlements,
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'source', 'bridge_apply_workspace_plan_change',
      'appliedBy', v_actor,
      'planChangeRequestId', v_request.id,
      'appliedAt', now()
    ),
    updated_at = now()
  where id = v_subscription.id
  returning * into v_subscription;

  update public.workspace_plan_change_requests
  set
    status = 'approved',
    reviewed_by = v_actor,
    reviewed_at = now(),
    review_note = nullif(trim(coalesce(p_review_note, '')), ''),
    updated_at = now()
  where id = v_request.id
  returning * into v_request;

  perform public.bridge_log_workspace_billing_event(
    v_request.organisation_id,
    v_subscription.id,
    v_request.id,
    'plan_change_approved',
    v_actor,
    v_previous_plan_key,
    v_subscription.plan_key,
    jsonb_build_object('reviewNote', nullif(trim(coalesce(p_review_note, '')), ''))
  );

  return jsonb_build_object(
    'id', v_subscription.id,
    'organisationId', v_subscription.organisation_id,
    'planKey', v_subscription.plan_key,
    'planName', v_subscription.plan_name,
    'status', v_subscription.status,
    'billingCycle', v_subscription.billing_cycle,
    'currentPeriodEndsAt', v_subscription.current_period_ends_at
  );
end;
$$;

alter table public.workspace_plan_change_requests enable row level security;
alter table public.workspace_billing_events enable row level security;

drop policy if exists workspace_plan_change_requests_select_members on public.workspace_plan_change_requests;
create policy workspace_plan_change_requests_select_members
  on public.workspace_plan_change_requests for select
  to authenticated
  using (
    exists (
      select 1
      from public.organisation_users ou
      where ou.organisation_id = workspace_plan_change_requests.organisation_id
        and ou.user_id = auth.uid()
        and lower(coalesce(ou.status, 'active')) = 'active'
    )
  );

drop policy if exists workspace_billing_events_select_members on public.workspace_billing_events;
create policy workspace_billing_events_select_members
  on public.workspace_billing_events for select
  to authenticated
  using (
    exists (
      select 1
      from public.organisation_users ou
      where ou.organisation_id = workspace_billing_events.organisation_id
        and ou.user_id = auth.uid()
        and lower(coalesce(ou.status, 'active')) = 'active'
    )
  );

grant select on public.workspace_plan_change_requests to authenticated;
grant select on public.workspace_billing_events to authenticated;
grant execute on function public.bridge_request_workspace_plan_change(uuid, text, text) to authenticated;
grant execute on function public.bridge_apply_workspace_plan_change(uuid, text) to authenticated;

commit;
