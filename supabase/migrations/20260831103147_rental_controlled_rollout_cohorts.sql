-- Phase 74: Rentals-only rollout controls. These records do not override
-- environment feature flags and cannot turn a cohort into a broad release.
create table public.rental_rollout_controls (
  organisation_id uuid not null references public.organisations(id),
  capability_key text not null check (capability_key in (
    'portfolio', 'applications', 'tenancies', 'financials',
    'landlord_portal', 'tenant_portal'
  )),
  status text not null default 'disabled' check (status in ('disabled', 'pilot', 'paused')),
  cohort_label text,
  max_active_tenancies integer check (max_active_tenancies is null or max_active_tenancies >= 0),
  reason text,
  changed_by uuid not null references auth.users(id),
  changed_at timestamptz not null default now(),
  primary key (organisation_id, capability_key)
);

create table public.rental_rollout_control_events (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  capability_key text not null,
  idempotency_key text not null,
  previous_status text,
  next_status text not null,
  actor_id uuid not null references auth.users(id),
  reason text,
  created_at timestamptz not null default now(),
  unique (organisation_id, idempotency_key)
);

create index rental_rollout_controls_status_idx
  on public.rental_rollout_controls (organisation_id, status, capability_key);
create index rental_rollout_control_events_org_created_idx
  on public.rental_rollout_control_events (organisation_id, created_at desc);
create index rental_rollout_control_events_actor_idx
  on public.rental_rollout_control_events (actor_id);

alter table public.rental_rollout_controls enable row level security;
alter table public.rental_rollout_control_events enable row level security;

create policy "rental_rollout_controls_manager_read"
  on public.rental_rollout_controls for select to authenticated
  using (public.rental_financial_manager_authorized(organisation_id));
create policy "rental_rollout_control_events_manager_read"
  on public.rental_rollout_control_events for select to authenticated
  using (public.rental_financial_manager_authorized(organisation_id));

create or replace function public.rental_set_rollout_control(
  p_org uuid,
  p_capability_key text,
  p_status text,
  p_cohort_label text,
  p_max_active_tenancies integer,
  p_reason text,
  p_idempotency_key text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_previous_status text;
  v_event public.rental_rollout_control_events;
begin
  if auth.uid() is null
    or not public.rental_financial_manager_authorized(p_org)
    or p_capability_key not in ('portfolio', 'applications', 'tenancies', 'financials', 'landlord_portal', 'tenant_portal')
    or p_status not in ('disabled', 'pilot', 'paused')
    or p_max_active_tenancies is not null and p_max_active_tenancies < 0
    or length(btrim(coalesce(p_idempotency_key, ''))) < 8
    or p_status = 'pilot' and (
      length(btrim(coalesce(p_cohort_label, ''))) < 3
      or length(btrim(coalesce(p_reason, ''))) < 8
    )
  then
    raise exception 'Invalid rollout control';
  end if;

  select * into v_event
  from public.rental_rollout_control_events
  where organisation_id = p_org and idempotency_key = btrim(p_idempotency_key);

  if found then
    return jsonb_build_object(
      'capability_key', v_event.capability_key,
      'status', v_event.next_status,
      'event_id', v_event.id,
      'idempotent', true,
      'environment_flag_required', true
    );
  end if;

  select status into v_previous_status
  from public.rental_rollout_controls
  where organisation_id = p_org and capability_key = p_capability_key
  for update;

  insert into public.rental_rollout_controls (
    organisation_id, capability_key, status, cohort_label,
    max_active_tenancies, reason, changed_by, changed_at
  ) values (
    p_org, p_capability_key, p_status,
    nullif(btrim(coalesce(p_cohort_label, '')), ''),
    p_max_active_tenancies,
    nullif(btrim(coalesce(p_reason, '')), ''), auth.uid(), now()
  )
  on conflict (organisation_id, capability_key) do update set
    status = excluded.status,
    cohort_label = excluded.cohort_label,
    max_active_tenancies = excluded.max_active_tenancies,
    reason = excluded.reason,
    changed_by = excluded.changed_by,
    changed_at = excluded.changed_at;

  insert into public.rental_rollout_control_events (
    organisation_id, capability_key, idempotency_key, previous_status,
    next_status, actor_id, reason
  ) values (
    p_org, p_capability_key, btrim(p_idempotency_key), v_previous_status,
    p_status, auth.uid(), nullif(btrim(coalesce(p_reason, '')), '')
  ) returning * into v_event;

  insert into public.rental_privileged_audit_events (
    organisation_id, event_key, subject_type, actor_id, metadata
  ) values (
    p_org, 'rental_rollout_control_changed', 'rollout_control', auth.uid(),
    jsonb_build_object(
      'capability_key', p_capability_key,
      'previous_status', v_previous_status,
      'next_status', p_status,
      'event_id', v_event.id,
      'environment_flag_required', true
    )
  );

  return jsonb_build_object(
    'capability_key', p_capability_key,
    'status', p_status,
    'event_id', v_event.id,
    'idempotent', false,
    'environment_flag_required', true
  );
end;
$$;

create or replace function public.rental_get_rollout_controls(p_org uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.rental_financial_manager_authorized(p_org) then
    raise exception 'Not authorized';
  end if;

  return jsonb_build_object(
    'controls', coalesce((
      select jsonb_agg(to_jsonb(control) order by control.capability_key)
      from public.rental_rollout_controls control
      where control.organisation_id = p_org
    ), '[]'::jsonb),
    'recent_events', coalesce((
      select jsonb_agg(to_jsonb(event) order by event.created_at desc)
      from (
        select * from public.rental_rollout_control_events
        where organisation_id = p_org
        order by created_at desc
        limit 50
      ) event
    ), '[]'::jsonb),
    'guardrail', 'A pilot control is advisory until its matching Rentals environment flag is enabled. It never enables Sales.'
  );
end;
$$;

revoke all on function public.rental_set_rollout_control(uuid, text, text, text, integer, text, text) from public, anon;
revoke all on function public.rental_get_rollout_controls(uuid) from public, anon;
grant execute on function public.rental_set_rollout_control(uuid, text, text, text, integer, text, text) to authenticated;
grant execute on function public.rental_get_rollout_controls(uuid) to authenticated;
