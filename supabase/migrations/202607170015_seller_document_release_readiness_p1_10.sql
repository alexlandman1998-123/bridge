begin;

create table if not exists public.seller_document_automation_heartbeats (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  dry_run boolean not null default false,
  status text not null default 'completed',
  payload jsonb not null default '{}'::jsonb,
  recorded_at timestamptz not null default now(),
  constraint seller_document_automation_heartbeats_status_check check (status in ('completed','failed'))
);

create index if not exists seller_document_automation_heartbeats_live_idx
  on public.seller_document_automation_heartbeats(source, recorded_at desc) where not dry_run;

alter table public.seller_document_automation_heartbeats enable row level security;

create table if not exists public.seller_document_rollout_controls (
  organisation_id uuid primary key references public.organisations(id) on delete cascade,
  mode text not null default 'paused',
  canary_listing_id uuid references public.private_listings(id) on delete set null,
  revision integer not null default 1,
  reason text not null,
  last_canary_status text,
  last_canary_at timestamptz,
  last_canary_report jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint seller_document_rollout_controls_mode_check check (mode in ('paused','canary','enabled')),
  constraint seller_document_rollout_controls_canary_status_check check (last_canary_status is null or last_canary_status in ('pass','failed'))
);

create table if not exists public.seller_document_rollout_audit (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  previous_mode text,
  next_mode text not null,
  revision integer not null,
  reason text not null,
  canary_listing_id uuid references public.private_listings(id) on delete set null,
  readiness_report jsonb,
  performed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists seller_document_rollout_audit_scope_idx
  on public.seller_document_rollout_audit(organisation_id, created_at desc);

alter table public.seller_document_rollout_controls enable row level security;
alter table public.seller_document_rollout_audit enable row level security;

drop policy if exists seller_document_rollout_controls_member_select on public.seller_document_rollout_controls;
create policy seller_document_rollout_controls_member_select
on public.seller_document_rollout_controls for select to authenticated
using (public.bridge_is_active_member(organisation_id));

drop policy if exists seller_document_rollout_audit_member_select on public.seller_document_rollout_audit;
create policy seller_document_rollout_audit_member_select
on public.seller_document_rollout_audit for select to authenticated
using (public.bridge_is_active_member(organisation_id));

create or replace function public.bridge_record_seller_document_automation_heartbeat_p1_10(
  p_source text default 'notification_reminder_dispatch',
  p_dry_run boolean default false,
  p_status text default 'completed',
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if coalesce(p_status, '') not in ('completed','failed') then
    raise exception 'Unsupported heartbeat status.' using errcode = '22023';
  end if;
  insert into public.seller_document_automation_heartbeats(source, dry_run, status, payload)
  values (coalesce(nullif(trim(p_source), ''), 'notification_reminder_dispatch'), coalesce(p_dry_run, false), p_status, coalesce(p_payload, '{}'::jsonb))
  returning id into v_id;
  return jsonb_build_object('success', true, 'heartbeat_id', v_id, 'dry_run', coalesce(p_dry_run, false), 'recorded_at', now());
end;
$$;

create or replace function public.bridge_seller_document_release_snapshot_p1_10(
  p_organisation_id uuid,
  p_listing_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_required_automations text[] := array[
    'seller_document_requested', 'seller_document_request_reminder', 'seller_document_request_escalation',
    'seller_document_review_sla_warning',
    'seller_document_review_sla_breach', 'seller_document_review_sla_critical'
  ];
  v_missing_automations text[] := '{}'::text[];
  v_dependencies_ready boolean := false;
  v_last_live_at timestamptz;
  v_heartbeat_age numeric;
  v_operational_blocking integer := 0;
  v_operational_attention integer := 0;
  v_continuity_blocking integer := 0;
  v_continuity_attention integer := 0;
  v_sla_blocking integer := 0;
  v_sla_attention integer := 0;
  v_failed_notifications integer := 0;
  v_control jsonb;
  v_release_ready boolean := false;
begin
  if p_organisation_id is null then
    raise exception 'organisation_id is required.' using errcode = '22023';
  end if;
  if coalesce(auth.role(), '') <> 'service_role' and not public.bridge_is_active_member(p_organisation_id) then
    raise exception 'Not authorised for this organisation.' using errcode = '42501';
  end if;
  if p_listing_id is not null and not exists (
    select 1 from public.private_listings where id = p_listing_id and organisation_id = p_organisation_id
  ) then
    raise exception 'Canary listing does not belong to the organisation.' using errcode = '22023';
  end if;

  v_dependencies_ready :=
    to_regclass('public.private_listing_seller_document_operational_readiness_v1') is not null and
    to_regclass('public.seller_document_transaction_continuity_v2') is not null and
    to_regclass('public.seller_document_review_queue_v1') is not null and
    to_regclass('public.seller_document_review_sla_v1') is not null and
    to_regprocedure('public.bridge_queue_seller_document_follow_ups_p0_3(integer,timestamptz,boolean,uuid)') is not null and
    to_regprocedure('public.bridge_reconcile_seller_document_operations_p0_5(uuid,uuid,boolean,text)') is not null and
    to_regprocedure('public.bridge_review_private_listing_seller_document_p1_8(uuid,text,text,integer)') is not null and
    to_regprocedure('public.bridge_refresh_seller_document_review_sla_p1_9(integer,timestamptz,boolean,uuid,uuid)') is not null;

  select coalesce(array_agg(required_key order by required_key), '{}'::text[])
  into v_missing_automations
  from unnest(v_required_automations) required_key
  where not exists (
    select 1 from public.notification_automation_definitions definition
    where definition.automation_key = required_key
      and definition.implementation_status = 'active'
      and definition.default_enabled
  );

  select max(recorded_at) into v_last_live_at
  from public.seller_document_automation_heartbeats
  where source = 'notification_reminder_dispatch' and not dry_run and status = 'completed';
  v_heartbeat_age := case when v_last_live_at is null then null else extract(epoch from (now() - v_last_live_at)) / 60.0 end;

  select coalesce(sum(blocking_issue_count), 0)::integer, coalesce(sum(attention_issue_count), 0)::integer
  into v_operational_blocking, v_operational_attention
  from public.private_listing_seller_document_operational_readiness_v1
  where organisation_id = p_organisation_id and (p_listing_id is null or private_listing_id = p_listing_id);

  select
    count(*) filter (where continuity_health = 'blocked')::integer,
    count(*) filter (where continuity_health in ('attention','pending'))::integer
  into v_continuity_blocking, v_continuity_attention
  from public.seller_document_transaction_continuity_v2
  where organisation_id = p_organisation_id and (p_listing_id is null or private_listing_id = p_listing_id);

  select
    count(*) filter (where sla_state in ('critical','unassigned') or failed_notification_count > 0)::integer,
    count(*) filter (where sla_state in ('breached','due_soon') and failed_notification_count = 0)::integer
  into v_sla_blocking, v_sla_attention
  from public.seller_document_review_sla_v1
  where organisation_id = p_organisation_id and (p_listing_id is null or private_listing_id = p_listing_id);

  select count(*)::integer into v_failed_notifications
  from public.notification_events
  where organisation_id = p_organisation_id
    and automation_key like 'seller_document_%'
    and status = 'failed'
    and created_at >= now() - interval '24 hours';

  select to_jsonb(control) into v_control
  from public.seller_document_rollout_controls control where control.organisation_id = p_organisation_id;

  v_release_ready := v_dependencies_ready
    and coalesce(array_length(v_missing_automations, 1), 0) = 0
    and v_last_live_at >= now() - interval '2 hours'
    and v_operational_blocking = 0 and v_operational_attention = 0
    and v_continuity_blocking = 0 and v_continuity_attention = 0
    and v_sla_blocking = 0 and v_sla_attention = 0
    and v_failed_notifications = 0;

  return jsonb_build_object(
    'version', 'seller_document_release_snapshot_p1_10_v1',
    'generated_at', now(), 'organisation_id', p_organisation_id, 'listing_id', p_listing_id,
    'dependencies_ready', v_dependencies_ready, 'missing_automations', to_jsonb(v_missing_automations),
    'last_live_heartbeat_at', v_last_live_at, 'heartbeat_age_minutes', v_heartbeat_age,
    'heartbeat_fresh', coalesce(v_last_live_at >= now() - interval '2 hours', false),
    'operational_blocking_count', v_operational_blocking, 'operational_attention_count', v_operational_attention,
    'continuity_blocking_count', v_continuity_blocking, 'continuity_attention_count', v_continuity_attention,
    'sla_blocking_count', v_sla_blocking, 'sla_attention_count', v_sla_attention,
    'failed_notification_count', v_failed_notifications, 'release_ready', v_release_ready,
    'rollout_control', v_control
  );
end;
$$;

create or replace function public.bridge_set_seller_document_rollout_p1_10(
  p_organisation_id uuid,
  p_mode text,
  p_canary_listing_id uuid default null,
  p_reason text default null,
  p_expected_revision integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current public.seller_document_rollout_controls%rowtype;
  v_snapshot jsonb;
  v_next_revision integer;
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required.' using errcode = '42501'; end if;
  if p_mode not in ('paused','canary','enabled') then raise exception 'Unsupported rollout mode.' using errcode = '22023'; end if;
  if nullif(trim(coalesce(p_reason, '')), '') is null then raise exception 'A rollout reason is required.' using errcode = '22023'; end if;
  if p_mode = 'canary' and p_canary_listing_id is null then raise exception 'Canary mode requires a listing.' using errcode = '22023'; end if;
  if p_canary_listing_id is not null and not exists (
    select 1 from public.private_listings where id = p_canary_listing_id and organisation_id = p_organisation_id
  ) then raise exception 'Canary listing does not belong to the organisation.' using errcode = '22023'; end if;

  select * into v_current from public.seller_document_rollout_controls where organisation_id = p_organisation_id for update;
  if found and v_current.revision <> coalesce(p_expected_revision, 0) then raise exception 'Rollout revision conflict.' using errcode = '40001'; end if;
  if not found and coalesce(p_expected_revision, 0) <> 0 then raise exception 'Rollout revision conflict.' using errcode = '40001'; end if;

  -- Canary entry is listing-scoped; broad enablement is deliberately rechecked
  -- across the full organisation so a healthy pilot cannot hide other blockers.
  v_snapshot := public.bridge_seller_document_release_snapshot_p1_10(
    p_organisation_id,
    case when p_mode = 'canary' then p_canary_listing_id else null end
  );
  if p_mode = 'canary' and (
    not coalesce((v_snapshot->>'dependencies_ready')::boolean, false)
    or jsonb_array_length(coalesce(v_snapshot->'missing_automations', '[]'::jsonb)) > 0
    or not coalesce((v_snapshot->>'heartbeat_fresh')::boolean, false)
  ) then
    raise exception 'P0-1 through P1-10 dependencies, automations and a fresh live heartbeat are required before canary mode.' using errcode = 'P0001';
  end if;
  if p_mode = 'enabled' and (
    v_current.mode is distinct from 'canary' or v_current.last_canary_status is distinct from 'pass'
    or v_current.last_canary_at < now() - interval '24 hours'
    or not coalesce((v_snapshot->>'release_ready')::boolean, false)
  ) then raise exception 'A passing canary from the last 24 hours and a passing release snapshot are required.' using errcode = 'P0001'; end if;

  v_next_revision := coalesce(v_current.revision, 0) + 1;
  insert into public.seller_document_rollout_controls(
    organisation_id, mode, canary_listing_id, revision, reason, last_canary_status,
    last_canary_at, last_canary_report, updated_by, updated_at
  ) values (
    p_organisation_id, p_mode, case when p_mode = 'canary' then p_canary_listing_id else v_current.canary_listing_id end,
    v_next_revision, trim(p_reason), v_current.last_canary_status, v_current.last_canary_at,
    v_current.last_canary_report, auth.uid(), now()
  ) on conflict (organisation_id) do update set
    mode = excluded.mode, canary_listing_id = excluded.canary_listing_id, revision = excluded.revision,
    reason = excluded.reason,
    last_canary_status = case when excluded.mode = 'canary' then null else public.seller_document_rollout_controls.last_canary_status end,
    last_canary_at = case when excluded.mode = 'canary' then null else public.seller_document_rollout_controls.last_canary_at end,
    last_canary_report = case when excluded.mode = 'canary' then null else public.seller_document_rollout_controls.last_canary_report end,
    updated_by = excluded.updated_by, updated_at = excluded.updated_at;

  insert into public.seller_document_rollout_audit(
    organisation_id, previous_mode, next_mode, revision, reason, canary_listing_id, readiness_report, performed_by
  ) values (p_organisation_id, v_current.mode, p_mode, v_next_revision, trim(p_reason), coalesce(p_canary_listing_id, v_current.canary_listing_id), v_snapshot, auth.uid());
  return jsonb_build_object('success', true, 'mode', p_mode, 'revision', v_next_revision, 'snapshot', v_snapshot);
end;
$$;

create or replace function public.bridge_certify_seller_document_canary_p1_10(
  p_organisation_id uuid,
  p_listing_id uuid,
  p_expected_revision integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_control public.seller_document_rollout_controls%rowtype;
  v_snapshot jsonb;
  v_status text;
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required.' using errcode = '42501'; end if;
  select * into v_control from public.seller_document_rollout_controls where organisation_id = p_organisation_id for update;
  if not found or v_control.mode <> 'canary' or v_control.canary_listing_id is distinct from p_listing_id then
    raise exception 'Organisation is not in canary mode for this listing.' using errcode = 'P0001';
  end if;
  if v_control.revision <> p_expected_revision then raise exception 'Rollout revision conflict.' using errcode = '40001'; end if;
  v_snapshot := public.bridge_seller_document_release_snapshot_p1_10(p_organisation_id, p_listing_id);
  v_status := case when coalesce((v_snapshot->>'release_ready')::boolean, false) then 'pass' else 'failed' end;
  update public.seller_document_rollout_controls set
    last_canary_status = v_status, last_canary_at = now(), last_canary_report = v_snapshot,
    revision = revision + 1, updated_by = auth.uid(), updated_at = now()
  where organisation_id = p_organisation_id;
  insert into public.seller_document_rollout_audit(
    organisation_id, previous_mode, next_mode, revision, reason, canary_listing_id, readiness_report, performed_by
  ) values (p_organisation_id, 'canary', 'canary', v_control.revision + 1, 'canary_certification_' || v_status, p_listing_id, v_snapshot, auth.uid());
  return jsonb_build_object('success', v_status = 'pass', 'status', v_status, 'revision', v_control.revision + 1, 'report', v_snapshot);
end;
$$;

revoke all on function public.bridge_record_seller_document_automation_heartbeat_p1_10(text,boolean,text,jsonb) from public, anon, authenticated;
revoke all on function public.bridge_set_seller_document_rollout_p1_10(uuid,text,uuid,text,integer) from public, anon, authenticated;
revoke all on function public.bridge_certify_seller_document_canary_p1_10(uuid,uuid,integer) from public, anon, authenticated;
grant execute on function public.bridge_record_seller_document_automation_heartbeat_p1_10(text,boolean,text,jsonb) to service_role;
grant execute on function public.bridge_seller_document_release_snapshot_p1_10(uuid,uuid) to authenticated, service_role;
grant execute on function public.bridge_set_seller_document_rollout_p1_10(uuid,text,uuid,text,integer) to service_role;
grant execute on function public.bridge_certify_seller_document_canary_p1_10(uuid,uuid,integer) to service_role;

notify pgrst, 'reload schema';
commit;
