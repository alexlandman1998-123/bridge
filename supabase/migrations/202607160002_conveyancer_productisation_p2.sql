begin;

-- P2 activation is append-only and defaults to disabled when no control exists.
create table if not exists public.conveyancer_orchestration_controls (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null default gen_random_uuid(),
  revision integer not null check (revision > 0),
  organisation_id uuid not null references public.organisations(id) on delete restrict,
  attorney_firm_id uuid not null references public.attorney_firms(id) on delete restrict,
  mode text not null check (mode in ('disabled', 'observe', 'pilot', 'live')),
  allowed_event_types text[] not null default '{}'::text[],
  pilot_transaction_ids uuid[] not null default '{}'::uuid[],
  kill_switch_enabled boolean not null default true,
  reason text not null,
  contract_version text not null default 'conveyancer_orchestration_p2_v1',
  fingerprint text not null check (length(trim(fingerprint)) >= 8),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  unique (record_id, revision),
  unique (id, organisation_id, attorney_firm_id)
);

create table if not exists public.conveyancer_orchestration_receipts (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete restrict,
  attorney_firm_id uuid not null references public.attorney_firms(id) on delete restrict,
  transaction_id uuid not null references public.transactions(id) on delete restrict,
  control_id uuid not null,
  event_id text not null,
  event_type text not null,
  source_reference text not null,
  input_fingerprint text not null check (length(trim(input_fingerprint)) >= 8),
  output_fingerprint text not null check (length(trim(output_fingerprint)) >= 8),
  decision text not null check (decision in ('committed', 'duplicate')),
  command_results jsonb not null default '[]'::jsonb check (jsonb_typeof(command_results) = 'array'),
  actor_user_id uuid not null,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (attorney_firm_id, event_id),
  foreign key (control_id, organisation_id, attorney_firm_id)
    references public.conveyancer_orchestration_controls (id, organisation_id, attorney_firm_id) on delete restrict
);

create index if not exists conveyancer_orchestration_controls_scope_idx
  on public.conveyancer_orchestration_controls (organisation_id, attorney_firm_id, revision desc, created_at desc);
create index if not exists conveyancer_orchestration_receipts_scope_idx
  on public.conveyancer_orchestration_receipts (organisation_id, attorney_firm_id, transaction_id, occurred_at desc);

alter table public.conveyancer_orchestration_controls enable row level security;
alter table public.conveyancer_orchestration_receipts enable row level security;

create policy conveyancer_orchestration_controls_select_scoped
on public.conveyancer_orchestration_controls for select to authenticated
using (public.bridge_conveyancer_can_access_record(organisation_id, attorney_firm_id, null::uuid));

create policy conveyancer_orchestration_receipts_select_scoped
on public.conveyancer_orchestration_receipts for select to authenticated
using (public.bridge_conveyancer_can_access_record(organisation_id, attorney_firm_id, transaction_id));

revoke all on public.conveyancer_orchestration_controls from anon, authenticated, service_role;
revoke all on public.conveyancer_orchestration_receipts from anon, authenticated, service_role;
grant select on public.conveyancer_orchestration_controls to authenticated, service_role;
grant select on public.conveyancer_orchestration_receipts to authenticated, service_role;

create trigger conveyancer_orchestration_controls_immutable
before update or delete on public.conveyancer_orchestration_controls
for each row execute function public.bridge_conveyancer_reject_mutation();
create trigger conveyancer_orchestration_receipts_immutable
before update or delete on public.conveyancer_orchestration_receipts
for each row execute function public.bridge_conveyancer_reject_mutation();
create trigger conveyancer_orchestration_controls_audit_insert
after insert on public.conveyancer_orchestration_controls
for each row execute function public.bridge_conveyancer_capture_insert_audit();
create trigger conveyancer_orchestration_receipts_audit_insert
after insert on public.conveyancer_orchestration_receipts
for each row execute function public.bridge_conveyancer_capture_insert_audit();

-- Expand A5 persistence vocabulary to match the existing action execution contract.
alter table public.conveyancer_action_events drop constraint if exists conveyancer_action_events_event_type_check;
alter table public.conveyancer_action_events
  add constraint conveyancer_action_events_event_type_check
  check (event_type in (
    'queued', 'claimed', 'started', 'completed', 'failed', 'cancelled', 'reassigned',
    'reminded', 'escalated', 'evidence_recorded', 'submitted_for_review', 'waiting',
    'blocked', 'resumed', 'reopened'
  ));

create or replace function public.bridge_set_conveyancer_orchestration_control(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payload jsonb := coalesce(payload, '{}'::jsonb);
  v_user_id uuid := auth.uid();
  v_organisation_id uuid;
  v_firm_id uuid;
  v_record_id uuid;
  v_revision integer;
  v_mode text := lower(trim(coalesce(v_payload ->> 'mode', '')));
  v_reason text := trim(coalesce(v_payload ->> 'reason', ''));
  v_fingerprint text := trim(coalesce(v_payload ->> 'fingerprint', ''));
  v_allowed text[];
  v_pilot_ids uuid[];
  v_row public.conveyancer_orchestration_controls%rowtype;
begin
  if v_user_id is null then raise exception 'Authentication is required.' using errcode = '42501'; end if;
  begin
    v_organisation_id := (v_payload ->> 'organisationId')::uuid;
    v_firm_id := (v_payload ->> 'attorneyFirmId')::uuid;
  exception when invalid_text_representation then
    raise exception 'P2 organisation or firm id is invalid.' using errcode = '22023';
  end;
  if not public.attorney_user_is_firm_admin(v_firm_id) then
    raise exception 'Firm administrator authority is required.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.attorney_firms f where f.id = v_firm_id and f.organisation_id = v_organisation_id and f.is_active) then
    raise exception 'P2 firm and organisation binding is invalid.' using errcode = '22023';
  end if;
  if v_mode not in ('disabled', 'observe', 'pilot', 'live') or v_reason = '' or length(v_fingerprint) < 8 then
    raise exception 'P2 control mode, reason or fingerprint is invalid.' using errcode = '22023';
  end if;

  select coalesce(array_agg(distinct lower(trim(value))) filter (where trim(value) <> ''), '{}'::text[])
  into v_allowed
  from jsonb_array_elements_text(coalesce(v_payload -> 'allowedEventTypes', '[]'::jsonb)) as event_types(value);

  begin
    select coalesce(array_agg(distinct value::uuid), '{}'::uuid[])
    into v_pilot_ids
    from jsonb_array_elements_text(coalesce(v_payload -> 'pilotTransactionIds', '[]'::jsonb)) as pilot_rows(value);
  exception when invalid_text_representation then
    raise exception 'P2 pilot transaction id is invalid.' using errcode = '22023';
  end;

  if v_mode = 'pilot' and cardinality(v_pilot_ids) = 0 then
    raise exception 'Pilot mode requires at least one transaction.' using errcode = '22023';
  end if;
  if v_mode in ('pilot', 'live') and coalesce(v_payload ->> 'killSwitchEnabled', 'true')::boolean is true then
    raise exception 'Writes cannot be enabled while the kill switch is on.' using errcode = '22023';
  end if;

  select control.record_id, control.revision + 1
  into v_record_id, v_revision
  from public.conveyancer_orchestration_controls control
  where control.organisation_id = v_organisation_id and control.attorney_firm_id = v_firm_id
  order by control.revision desc limit 1;
  v_record_id := coalesce(v_record_id, gen_random_uuid());
  v_revision := coalesce(v_revision, 1);

  insert into public.conveyancer_orchestration_controls (
    record_id, revision, organisation_id, attorney_firm_id, mode, allowed_event_types,
    pilot_transaction_ids, kill_switch_enabled, reason, fingerprint, created_by
  ) values (
    v_record_id, v_revision, v_organisation_id, v_firm_id, v_mode, v_allowed,
    v_pilot_ids, coalesce((v_payload ->> 'killSwitchEnabled')::boolean, true), v_reason, v_fingerprint, v_user_id
  ) returning * into v_row;

  return jsonb_build_object('id', v_row.id, 'recordId', v_row.record_id, 'revision', v_row.revision, 'mode', v_row.mode, 'killSwitchEnabled', v_row.kill_switch_enabled);
end;
$$;

create or replace function public.bridge_apply_conveyancer_orchestration_batch(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payload jsonb := coalesce(payload, '{}'::jsonb);
  v_user_id uuid := auth.uid();
  v_organisation_id uuid;
  v_firm_id uuid;
  v_transaction_id uuid;
  v_event_id text := trim(coalesce(v_payload ->> 'eventId', ''));
  v_event_type text := lower(trim(coalesce(v_payload ->> 'eventType', '')));
  v_source_reference text := trim(coalesce(v_payload ->> 'sourceReference', ''));
  v_input_fingerprint text := trim(coalesce(v_payload ->> 'inputFingerprint', ''));
  v_output_fingerprint text := trim(coalesce(v_payload ->> 'outputFingerprint', ''));
  v_occurred_at timestamptz;
  v_member_role text;
  v_control public.conveyancer_orchestration_controls%rowtype;
  v_existing public.conveyancer_orchestration_receipts%rowtype;
  v_command jsonb;
  v_kind text;
  v_results jsonb := '[]'::jsonb;
  v_plan_id uuid;
  v_plan_record_id uuid;
  v_parent_plan_id uuid;
  v_inserted_id uuid;
begin
  if v_user_id is null then raise exception 'Authentication is required.' using errcode = '42501'; end if;
  begin
    v_organisation_id := (v_payload ->> 'organisationId')::uuid;
    v_firm_id := (v_payload ->> 'attorneyFirmId')::uuid;
    v_transaction_id := (v_payload ->> 'transactionId')::uuid;
    v_occurred_at := (v_payload ->> 'occurredAt')::timestamptz;
  exception when invalid_text_representation then
    raise exception 'P2 batch identity or timestamp is invalid.' using errcode = '22023';
  end;
  if v_event_id = '' or v_event_type = '' or v_source_reference = '' or length(v_input_fingerprint) < 8 or length(v_output_fingerprint) < 8 then
    raise exception 'P2 batch provenance is incomplete.' using errcode = '22023';
  end if;
  if jsonb_typeof(v_payload -> 'commands') <> 'array' or jsonb_array_length(v_payload -> 'commands') > 3 then
    raise exception 'P2 batch must contain no more than three commands.' using errcode = '22023';
  end if;
  if not public.bridge_conveyancer_can_access_record(v_organisation_id, v_firm_id, v_transaction_id) then
    raise exception 'P2 matter access denied.' using errcode = '42501';
  end if;
  select member.role into v_member_role
  from public.attorney_firm_members member
  where member.firm_id = v_firm_id and member.user_id = v_user_id and member.status = 'active';
  if v_member_role not in ('firm_admin', 'director_partner', 'transfer_attorney') then
    raise exception 'P2 pilot commands require transfer-attorney or management authority.' using errcode = '42501';
  end if;

  select * into v_existing from public.conveyancer_orchestration_receipts
  where attorney_firm_id = v_firm_id and event_id = v_event_id;
  if found then
    if v_existing.input_fingerprint <> v_input_fingerprint then
      raise exception 'P2 event idempotency conflict.' using errcode = '23505';
    end if;
    return jsonb_build_object('ok', true, 'duplicate', true, 'receiptId', v_existing.id, 'commandResults', v_existing.command_results);
  end if;

  select * into v_control
  from public.conveyancer_orchestration_controls control
  where control.organisation_id = v_organisation_id and control.attorney_firm_id = v_firm_id
  order by control.revision desc limit 1;
  if not found or v_control.mode not in ('pilot', 'live') or v_control.kill_switch_enabled then
    raise exception 'P2 orchestration writes are disabled.' using errcode = '42501';
  end if;
  if cardinality(v_control.allowed_event_types) > 0 and not (v_event_type = any(v_control.allowed_event_types)) then
    raise exception 'P2 event type is not enabled.' using errcode = '42501';
  end if;
  if v_control.mode = 'pilot' and not (v_transaction_id = any(v_control.pilot_transaction_ids)) then
    raise exception 'Matter is outside the P2 pilot cohort.' using errcode = '42501';
  end if;

  for v_command in select value from jsonb_array_elements(v_payload -> 'commands')
  loop
    v_kind := lower(trim(coalesce(v_command ->> 'kind', '')));
    if v_kind = 'matter_plan_revision' then
      begin
        v_plan_record_id := nullif(v_command ->> 'recordId', '')::uuid;
      exception when invalid_text_representation then
        raise exception 'P2 plan record id is invalid.' using errcode = '22023';
      end;
      v_plan_record_id := coalesce(v_plan_record_id, gen_random_uuid());
      if coalesce(v_command -> 'payload' ->> 'transactionId', '') <> v_transaction_id::text
        or coalesce(v_command -> 'payload' ->> 'organisationId', '') <> v_organisation_id::text then
        raise exception 'P2 plan payload binding is invalid.' using errcode = '22023';
      end if;
      insert into public.conveyancer_matter_plans (
        record_id, revision, organisation_id, attorney_firm_id, transaction_id, status, plan_type,
        source_phase, contract_version, fingerprint, classification, retention_policy,
        retention_until, legal_hold, payload, created_by
      ) values (
        v_plan_record_id, (v_command ->> 'revision')::integer, v_organisation_id, v_firm_id, v_transaction_id,
        v_command ->> 'status', coalesce(nullif(v_command ->> 'planType', ''), 'transfer'),
        coalesce(nullif(v_command ->> 'sourcePhase', ''), 'A2'), v_command ->> 'contractVersion', v_command ->> 'fingerprint',
        coalesce(nullif(v_command ->> 'classification', ''), 'privileged'),
        coalesce(nullif(v_command ->> 'retentionPolicy', ''), 'legal_matter_record'),
        nullif(v_command ->> 'retentionUntil', '')::timestamptz, coalesce((v_command ->> 'legalHold')::boolean, false),
        coalesce(v_command -> 'payload', '{}'::jsonb), v_user_id
      ) returning id into v_plan_id;
      v_results := v_results || jsonb_build_array(jsonb_build_object('kind', v_kind, 'id', v_plan_id, 'recordId', v_plan_record_id, 'revision', (v_command ->> 'revision')::integer));
    elsif v_kind = 'action_event' then
      begin
        v_parent_plan_id := (v_command ->> 'matterPlanId')::uuid;
      exception when invalid_text_representation then
        raise exception 'P2 action parent plan id is invalid.' using errcode = '22023';
      end;
      insert into public.conveyancer_action_events (
        organisation_id, attorney_firm_id, transaction_id, matter_plan_id, action_id, event_type,
        idempotency_key, source_phase, contract_version, fingerprint, classification,
        retention_policy, retention_until, legal_hold, payload, occurred_at, created_by
      ) values (
        v_organisation_id, v_firm_id, v_transaction_id, v_parent_plan_id, v_command ->> 'actionId',
        v_command ->> 'eventType', v_command ->> 'idempotencyKey', coalesce(nullif(v_command ->> 'sourcePhase', ''), 'A5'),
        v_command ->> 'contractVersion', v_command ->> 'fingerprint', coalesce(nullif(v_command ->> 'classification', ''), 'privileged'),
        coalesce(nullif(v_command ->> 'retentionPolicy', ''), 'legal_matter_record'),
        nullif(v_command ->> 'retentionUntil', '')::timestamptz, coalesce((v_command ->> 'legalHold')::boolean, false),
        coalesce(v_command -> 'payload', '{}'::jsonb), v_occurred_at, v_user_id
      ) returning id into v_inserted_id;
      v_results := v_results || jsonb_build_array(jsonb_build_object('kind', v_kind, 'id', v_inserted_id));
    else
      raise exception 'Unsupported P2 orchestration command: %', v_kind using errcode = '22023';
    end if;
  end loop;

  insert into public.conveyancer_orchestration_receipts (
    organisation_id, attorney_firm_id, transaction_id, control_id, event_id, event_type,
    source_reference, input_fingerprint, output_fingerprint, decision, command_results,
    actor_user_id, occurred_at
  ) values (
    v_organisation_id, v_firm_id, v_transaction_id, v_control.id, v_event_id, v_event_type,
    v_source_reference, v_input_fingerprint, v_output_fingerprint, 'committed', v_results,
    v_user_id, v_occurred_at
  ) returning id into v_inserted_id;

  return jsonb_build_object('ok', true, 'duplicate', false, 'receiptId', v_inserted_id, 'commandResults', v_results);
end;
$$;

revoke all on function public.bridge_set_conveyancer_orchestration_control(jsonb) from public;
revoke all on function public.bridge_apply_conveyancer_orchestration_batch(jsonb) from public;
grant execute on function public.bridge_set_conveyancer_orchestration_control(jsonb) to authenticated;
grant execute on function public.bridge_apply_conveyancer_orchestration_batch(jsonb) to authenticated;

comment on function public.bridge_apply_conveyancer_orchestration_batch(jsonb) is 'P2 atomic, idempotent append boundary for validated plan and action orchestration commands.';

notify pgrst, 'reload schema';
commit;
