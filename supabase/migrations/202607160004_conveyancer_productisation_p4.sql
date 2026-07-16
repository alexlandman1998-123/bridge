begin;

create table if not exists public.conveyancer_notification_controls (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null default gen_random_uuid(),
  revision integer not null check (revision > 0),
  organisation_id uuid not null references public.organisations(id) on delete restrict,
  attorney_firm_id uuid not null references public.attorney_firms(id) on delete restrict,
  mode text not null check (mode in ('disabled', 'observe', 'pilot', 'live')),
  channels text[] not null default array['in_app']::text[] check (channels <@ array['in_app']::text[]),
  pilot_transaction_ids uuid[] not null default '{}'::uuid[],
  due_soon_hours integer not null default 24 check (due_soon_hours between 1 and 168),
  escalation_hours integer not null default 24 check (escalation_hours between 1 and 336),
  kill_switch_enabled boolean not null default true,
  reason text not null check (length(trim(reason)) > 0),
  contract_version text not null default 'conveyancer_notification_p4_v1',
  fingerprint text not null check (length(trim(fingerprint)) >= 8),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  unique (record_id, revision),
  unique (id, organisation_id, attorney_firm_id)
);

create table if not exists public.conveyancer_notification_outbox (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete restrict,
  attorney_firm_id uuid not null references public.attorney_firms(id) on delete restrict,
  transaction_id uuid not null references public.transactions(id) on delete restrict,
  control_id uuid not null,
  plan_record_id uuid not null,
  plan_revision integer not null check (plan_revision > 0),
  action_id text not null check (length(trim(action_id)) > 0),
  action_revision integer not null default 0 check (action_revision >= 0),
  notification_kind text not null check (notification_kind in ('action_ready', 'review_required', 'blocker_opened', 'due_soon', 'overdue', 'escalation')),
  channel text not null check (channel = 'in_app'),
  recipient_user_id uuid not null,
  recipient_role text not null,
  title text not null check (length(trim(title)) between 1 and 160),
  message text not null check (length(trim(message)) between 1 and 500),
  dedupe_key text not null check (length(trim(dedupe_key)) between 8 and 500),
  intent_fingerprint text not null check (length(trim(intent_fingerprint)) >= 8),
  projection_fingerprint text not null check (length(trim(projection_fingerprint)) >= 8),
  available_at timestamptz not null,
  status text not null default 'queued' check (status in ('queued', 'processing', 'delivered', 'failed', 'skipped')),
  attempt_count integer not null default 0 check (attempt_count between 0 and 5),
  claimed_at timestamptz,
  delivered_at timestamptz,
  last_error text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (attorney_firm_id, dedupe_key),
  foreign key (control_id, organisation_id, attorney_firm_id)
    references public.conveyancer_notification_controls(id, organisation_id, attorney_firm_id) on delete restrict
);

create table if not exists public.conveyancer_notification_delivery_events (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete restrict,
  attorney_firm_id uuid not null references public.attorney_firms(id) on delete restrict,
  transaction_id uuid not null references public.transactions(id) on delete restrict,
  outbox_id uuid not null references public.conveyancer_notification_outbox(id) on delete restrict,
  event_type text not null check (event_type in ('claimed', 'delivered', 'failed', 'skipped')),
  provider text not null default 'transaction_notifications',
  provider_reference text,
  detail jsonb not null default '{}'::jsonb check (jsonb_typeof(detail) = 'object'),
  occurred_at timestamptz not null default now()
);

create index if not exists conveyancer_notification_controls_scope_idx
  on public.conveyancer_notification_controls(organisation_id, attorney_firm_id, revision desc);
create index if not exists conveyancer_notification_outbox_due_idx
  on public.conveyancer_notification_outbox(available_at, created_at) where status = 'queued';
create index if not exists conveyancer_notification_outbox_matter_idx
  on public.conveyancer_notification_outbox(organisation_id, attorney_firm_id, transaction_id, created_at desc);
create index if not exists conveyancer_notification_delivery_matter_idx
  on public.conveyancer_notification_delivery_events(organisation_id, attorney_firm_id, transaction_id, occurred_at desc);

alter table public.conveyancer_notification_controls enable row level security;
alter table public.conveyancer_notification_outbox enable row level security;
alter table public.conveyancer_notification_delivery_events enable row level security;

create policy conveyancer_notification_controls_select_scoped on public.conveyancer_notification_controls
  for select to authenticated using (public.bridge_conveyancer_can_access_record(organisation_id, attorney_firm_id, null::uuid));
create policy conveyancer_notification_outbox_select_scoped on public.conveyancer_notification_outbox
  for select to authenticated using (public.bridge_conveyancer_can_access_record(organisation_id, attorney_firm_id, transaction_id));
create policy conveyancer_notification_delivery_select_scoped on public.conveyancer_notification_delivery_events
  for select to authenticated using (public.bridge_conveyancer_can_access_record(organisation_id, attorney_firm_id, transaction_id));

revoke all on public.conveyancer_notification_controls from anon, authenticated, service_role;
revoke all on public.conveyancer_notification_outbox from anon, authenticated, service_role;
revoke all on public.conveyancer_notification_delivery_events from anon, authenticated, service_role;
grant select on public.conveyancer_notification_controls to authenticated, service_role;
grant select on public.conveyancer_notification_outbox to authenticated, service_role;
grant select on public.conveyancer_notification_delivery_events to authenticated, service_role;

drop trigger if exists conveyancer_notification_controls_immutable on public.conveyancer_notification_controls;
create trigger conveyancer_notification_controls_immutable before update or delete on public.conveyancer_notification_controls
  for each row execute function public.bridge_conveyancer_reject_mutation();
drop trigger if exists conveyancer_notification_delivery_immutable on public.conveyancer_notification_delivery_events;
create trigger conveyancer_notification_delivery_immutable before update or delete on public.conveyancer_notification_delivery_events
  for each row execute function public.bridge_conveyancer_reject_mutation();
drop trigger if exists conveyancer_notification_controls_audit on public.conveyancer_notification_controls;
create trigger conveyancer_notification_controls_audit after insert on public.conveyancer_notification_controls
  for each row execute function public.bridge_conveyancer_capture_insert_audit();

create or replace function public.bridge_set_conveyancer_notification_control(payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user_id uuid := auth.uid();
  v_org_id uuid;
  v_firm_id uuid;
  v_record_id uuid;
  v_revision integer;
  v_mode text := lower(trim(coalesce(payload ->> 'mode', 'disabled')));
  v_channels text[];
  v_pilot_ids uuid[];
  v_reason text := trim(coalesce(payload ->> 'reason', ''));
  v_fingerprint text := trim(coalesce(payload ->> 'fingerprint', ''));
  v_row public.conveyancer_notification_controls%rowtype;
begin
  if v_user_id is null then raise exception 'Authentication is required.' using errcode = '42501'; end if;
  begin
    v_org_id := (payload ->> 'organisationId')::uuid;
    v_firm_id := (payload ->> 'attorneyFirmId')::uuid;
    select coalesce(array_agg(distinct value::uuid), '{}'::uuid[]) into v_pilot_ids
      from jsonb_array_elements_text(coalesce(payload -> 'pilotTransactionIds', '[]'::jsonb)) values_list(value);
  exception when invalid_text_representation then raise exception 'P4 control identity is invalid.' using errcode = '22023';
  end;
  if not public.attorney_user_is_firm_admin(v_firm_id) then raise exception 'Firm administrator authority is required.' using errcode = '42501'; end if;
  if not exists (select 1 from public.attorney_firms where id = v_firm_id and organisation_id = v_org_id and is_active) then raise exception 'P4 firm binding is invalid.' using errcode = '22023'; end if;
  if exists (select 1 from jsonb_array_elements_text(coalesce(payload -> 'channels', '["in_app"]'::jsonb)) requested(value) where lower(trim(value)) <> 'in_app') then raise exception 'P4 currently supports the in-app delivery adapter only.' using errcode = '22023'; end if;
  select coalesce(array_agg(distinct lower(trim(value))), array['in_app']::text[]) into v_channels
    from jsonb_array_elements_text(coalesce(payload -> 'channels', '["in_app"]'::jsonb)) channel_list(value)
    where lower(trim(value)) = 'in_app';
  if v_mode not in ('disabled', 'observe', 'pilot', 'live') or v_reason = '' or length(v_fingerprint) < 8 or cardinality(v_channels) = 0 then raise exception 'P4 control is invalid.' using errcode = '22023'; end if;
  if v_mode = 'pilot' and cardinality(v_pilot_ids) = 0 then raise exception 'P4 pilot mode requires a transaction cohort.' using errcode = '22023'; end if;
  if v_mode in ('pilot', 'live') and coalesce((payload ->> 'killSwitchEnabled')::boolean, true) then raise exception 'P4 delivery cannot be enabled while its kill switch is on.' using errcode = '22023'; end if;
  select record_id, revision + 1 into v_record_id, v_revision from public.conveyancer_notification_controls
    where organisation_id = v_org_id and attorney_firm_id = v_firm_id order by revision desc limit 1;
  insert into public.conveyancer_notification_controls(record_id, revision, organisation_id, attorney_firm_id, mode, channels, pilot_transaction_ids, due_soon_hours, escalation_hours, kill_switch_enabled, reason, fingerprint, created_by)
  values(coalesce(v_record_id, gen_random_uuid()), coalesce(v_revision, 1), v_org_id, v_firm_id, v_mode, v_channels, v_pilot_ids,
    greatest(1, least(168, coalesce((payload ->> 'dueSoonHours')::integer, 24))), greatest(1, least(336, coalesce((payload ->> 'escalationHours')::integer, 24))),
    coalesce((payload ->> 'killSwitchEnabled')::boolean, true), v_reason, v_fingerprint, v_user_id) returning * into v_row;
  return jsonb_build_object('ok', true, 'id', v_row.id, 'recordId', v_row.record_id, 'revision', v_row.revision, 'mode', v_row.mode, 'killSwitchEnabled', v_row.kill_switch_enabled);
end;
$$;

create or replace function public.bridge_enqueue_conveyancer_notifications(payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user_id uuid := auth.uid();
  v_org_id uuid;
  v_firm_id uuid;
  v_transaction_id uuid;
  v_plan_record_id uuid;
  v_plan_revision integer;
  v_control public.conveyancer_notification_controls%rowtype;
  v_orchestration public.conveyancer_orchestration_controls%rowtype;
  v_plan public.conveyancer_matter_plans%rowtype;
  v_intent jsonb;
  v_recipient uuid;
  v_action_id text;
  v_available_at timestamptz;
  v_inserted integer := 0;
  v_duplicates integer := 0;
begin
  if v_user_id is null then raise exception 'Authentication is required.' using errcode = '42501'; end if;
  begin
    v_org_id := (payload ->> 'organisationId')::uuid;
    v_firm_id := (payload ->> 'attorneyFirmId')::uuid;
    v_transaction_id := (payload ->> 'transactionId')::uuid;
    v_plan_record_id := (payload ->> 'planRecordId')::uuid;
    v_plan_revision := (payload ->> 'planRevision')::integer;
  exception when invalid_text_representation then raise exception 'P4 enqueue identity is invalid.' using errcode = '22023';
  end;
  if coalesce(payload ->> 'version', '') <> 'conveyancer_notification_p4_v1' or length(trim(coalesce(payload ->> 'projectionFingerprint', ''))) < 8 then raise exception 'P4 projection provenance is invalid.' using errcode = '22023'; end if;
  if jsonb_typeof(payload -> 'intents') <> 'array' or jsonb_array_length(payload -> 'intents') > 50 then raise exception 'P4 enqueue accepts no more than 50 intents.' using errcode = '22023'; end if;
  if not public.bridge_conveyancer_can_access_record(v_org_id, v_firm_id, v_transaction_id) then raise exception 'P4 matter access denied.' using errcode = '42501'; end if;
  select * into v_control from public.conveyancer_notification_controls where organisation_id = v_org_id and attorney_firm_id = v_firm_id order by revision desc limit 1;
  if not found or v_control.mode not in ('pilot', 'live') or v_control.kill_switch_enabled then raise exception 'P4 notification delivery is disabled.' using errcode = '42501'; end if;
  if v_control.mode = 'pilot' and not (v_transaction_id = any(v_control.pilot_transaction_ids)) then raise exception 'Matter is outside the P4 pilot cohort.' using errcode = '42501'; end if;
  select * into v_orchestration from public.conveyancer_orchestration_controls where organisation_id = v_org_id and attorney_firm_id = v_firm_id order by revision desc limit 1;
  if not found or v_orchestration.mode not in ('pilot', 'live') or v_orchestration.kill_switch_enabled or (v_orchestration.mode = 'pilot' and not (v_transaction_id = any(v_orchestration.pilot_transaction_ids))) then raise exception 'P2 orchestration must remain enabled for P4 delivery.' using errcode = '42501'; end if;
  select * into v_plan from public.conveyancer_matter_plans where organisation_id = v_org_id and attorney_firm_id = v_firm_id and transaction_id = v_transaction_id and record_id = v_plan_record_id and revision = v_plan_revision;
  if not found then raise exception 'P4 plan revision binding is invalid.' using errcode = '22023'; end if;

  for v_intent in select value from jsonb_array_elements(payload -> 'intents') loop
    begin v_recipient := (v_intent ->> 'recipientUserId')::uuid; v_available_at := (v_intent ->> 'availableAt')::timestamptz;
    exception when invalid_text_representation then raise exception 'P4 intent identity or schedule is invalid.' using errcode = '22023'; end;
    v_action_id := trim(coalesce(v_intent ->> 'actionKey', ''));
    if lower(coalesce(v_intent ->> 'channel', '')) <> 'in_app' or length(trim(coalesce(v_intent ->> 'fingerprint', ''))) < 8 or length(trim(coalesce(v_intent ->> 'dedupeKey', ''))) < 8 then raise exception 'P4 intent provenance is invalid.' using errcode = '22023'; end if;
    if not exists (select 1 from public.attorney_firm_members where firm_id = v_firm_id and user_id = v_recipient and status = 'active') then raise exception 'P4 recipient is not an active member of the exact firm.' using errcode = '42501'; end if;
    if not exists (select 1 from jsonb_array_elements(coalesce(v_plan.payload -> 'actions', '[]'::jsonb)) action where action ->> 'key' = v_action_id) then raise exception 'P4 action is not part of the bound plan.' using errcode = '22023'; end if;
    insert into public.conveyancer_notification_outbox(organisation_id, attorney_firm_id, transaction_id, control_id, plan_record_id, plan_revision, action_id, action_revision, notification_kind, channel, recipient_user_id, recipient_role, title, message, dedupe_key, intent_fingerprint, projection_fingerprint, available_at, metadata, created_by)
    values(v_org_id, v_firm_id, v_transaction_id, v_control.id, v_plan_record_id, v_plan_revision, v_action_id, coalesce((v_intent ->> 'actionRevision')::integer, 0),
      lower(v_intent ->> 'kind'), 'in_app', v_recipient, lower(coalesce(v_intent ->> 'recipientRole', 'attorney')), left(trim(v_intent ->> 'title'), 160), left(trim(v_intent ->> 'message'), 500),
      trim(v_intent ->> 'dedupeKey'), trim(v_intent ->> 'fingerprint'), trim(payload ->> 'projectionFingerprint'), v_available_at, coalesce(v_intent -> 'metadata', '{}'::jsonb), v_user_id)
    on conflict(attorney_firm_id, dedupe_key) do nothing;
    if found then v_inserted := v_inserted + 1; else v_duplicates := v_duplicates + 1; end if;
  end loop;
  return jsonb_build_object('ok', true, 'queued', v_inserted, 'duplicates', v_duplicates, 'controlId', v_control.id);
end;
$$;

create or replace function public.bridge_dispatch_conveyancer_notifications(p_limit integer default 50, p_now timestamptz default now())
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_row public.conveyancer_notification_outbox%rowtype;
  v_control public.conveyancer_notification_controls%rowtype;
  v_orchestration public.conveyancer_orchestration_controls%rowtype;
  v_plan public.conveyancer_matter_plans%rowtype;
  v_reference uuid;
  v_delivered integer := 0;
  v_skipped integer := 0;
  v_failed integer := 0;
begin
  for v_row in select * from public.conveyancer_notification_outbox where status = 'queued' and available_at <= coalesce(p_now, now()) order by available_at, created_at limit greatest(0, least(coalesce(p_limit, 50), 200)) for update skip locked loop
    update public.conveyancer_notification_outbox set status = 'processing', claimed_at = now(), attempt_count = attempt_count + 1, updated_at = now() where id = v_row.id;
    insert into public.conveyancer_notification_delivery_events(organisation_id, attorney_firm_id, transaction_id, outbox_id, event_type) values(v_row.organisation_id, v_row.attorney_firm_id, v_row.transaction_id, v_row.id, 'claimed');
    select * into v_control from public.conveyancer_notification_controls where organisation_id = v_row.organisation_id and attorney_firm_id = v_row.attorney_firm_id order by revision desc limit 1;
    select * into v_orchestration from public.conveyancer_orchestration_controls where organisation_id = v_row.organisation_id and attorney_firm_id = v_row.attorney_firm_id order by revision desc limit 1;
    select * into v_plan from public.conveyancer_matter_plans where organisation_id = v_row.organisation_id and attorney_firm_id = v_row.attorney_firm_id and transaction_id = v_row.transaction_id and record_id = v_row.plan_record_id order by revision desc limit 1;
    if v_control.id is null or v_orchestration.id is null or v_control.kill_switch_enabled or v_control.mode not in ('pilot', 'live') or (v_control.mode = 'pilot' and not (v_row.transaction_id = any(v_control.pilot_transaction_ids)))
      or v_orchestration.kill_switch_enabled or v_orchestration.mode not in ('pilot', 'live') or (v_orchestration.mode = 'pilot' and not (v_row.transaction_id = any(v_orchestration.pilot_transaction_ids)))
      or not exists (select 1 from jsonb_array_elements(coalesce(v_plan.payload -> 'actions', '[]'::jsonb)) action where action ->> 'key' = v_row.action_id and lower(coalesce(action ->> 'state', 'upcoming')) not in ('completed', 'cancelled')) then
      update public.conveyancer_notification_outbox set status = 'skipped', last_error = 'control_or_plan_state_changed', updated_at = now() where id = v_row.id;
      insert into public.conveyancer_notification_delivery_events(organisation_id, attorney_firm_id, transaction_id, outbox_id, event_type, detail) values(v_row.organisation_id, v_row.attorney_firm_id, v_row.transaction_id, v_row.id, 'skipped', jsonb_build_object('reason', 'control_or_plan_state_changed'));
      v_skipped := v_skipped + 1; continue;
    end if;
    v_reference := public.bridge_insert_invite_accepted_transaction_notification_phase2(v_row.transaction_id, v_row.recipient_user_id, 'attorney', v_row.title, v_row.message, v_row.dedupe_key, v_row.metadata || jsonb_build_object('source', 'conveyancer_p4', 'notificationKind', v_row.notification_kind, 'actionKey', v_row.action_id));
    if v_reference is null then
      update public.conveyancer_notification_outbox set status = 'failed', last_error = 'in_app_projection_failed', updated_at = now() where id = v_row.id;
      insert into public.conveyancer_notification_delivery_events(organisation_id, attorney_firm_id, transaction_id, outbox_id, event_type, detail) values(v_row.organisation_id, v_row.attorney_firm_id, v_row.transaction_id, v_row.id, 'failed', jsonb_build_object('reason', 'in_app_projection_failed'));
      v_failed := v_failed + 1;
    else
      update public.conveyancer_notification_outbox set status = 'delivered', delivered_at = now(), last_error = null, updated_at = now() where id = v_row.id;
      insert into public.conveyancer_notification_delivery_events(organisation_id, attorney_firm_id, transaction_id, outbox_id, event_type, provider_reference) values(v_row.organisation_id, v_row.attorney_firm_id, v_row.transaction_id, v_row.id, 'delivered', v_reference::text);
      v_delivered := v_delivered + 1;
    end if;
  end loop;
  return jsonb_build_object('ok', true, 'delivered', v_delivered, 'skipped', v_skipped, 'failed', v_failed, 'processed', v_delivered + v_skipped + v_failed);
end;
$$;

revoke all on function public.bridge_set_conveyancer_notification_control(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.bridge_enqueue_conveyancer_notifications(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.bridge_dispatch_conveyancer_notifications(integer, timestamptz) from public, anon, authenticated, service_role;
grant execute on function public.bridge_set_conveyancer_notification_control(jsonb) to authenticated;
grant execute on function public.bridge_enqueue_conveyancer_notifications(jsonb) to authenticated;
grant execute on function public.bridge_dispatch_conveyancer_notifications(integer, timestamptz) to service_role;

comment on table public.conveyancer_notification_outbox is 'P4 durable, deduplicated notification schedule. Delivery never changes canonical legal facts.';
comment on function public.bridge_dispatch_conveyancer_notifications(integer, timestamptz) is 'P4 service-role dispatcher that rechecks controls and current plan state before projecting in-app notifications.';

notify pgrst, 'reload schema';
commit;
