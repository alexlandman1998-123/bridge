-- H4 notification runtime: receipt-bound internal alerts for H2 application events.

begin;

alter table public.conveyancer_notification_outbox
  add column if not exists source_type text not null default 'plan_action',
  add column if not exists source_event_id text;

alter table public.conveyancer_notification_outbox
  drop constraint if exists conveyancer_notification_outbox_source_type_check,
  drop constraint if exists conveyancer_notification_outbox_source_binding_check;

alter table public.conveyancer_notification_outbox
  add constraint conveyancer_notification_outbox_source_type_check
    check (source_type in ('plan_action', 'runtime_event')),
  add constraint conveyancer_notification_outbox_source_binding_check
    check ((source_type = 'plan_action' and source_event_id is null) or (source_type = 'runtime_event' and length(trim(source_event_id)) > 0));

create index if not exists conveyancer_notification_outbox_runtime_source_idx
  on public.conveyancer_notification_outbox(attorney_firm_id, transaction_id, source_event_id)
  where source_type = 'runtime_event';

create or replace function public.bridge_enqueue_conveyancer_notification_signal(payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_org uuid;
  v_firm uuid;
  v_tx uuid;
  v_event text := trim(coalesce(payload ->> 'eventId', ''));
  v_event_type text := lower(trim(coalesce(payload ->> 'eventType', '')));
  v_projection text := trim(coalesce(payload ->> 'projectionFingerprint', ''));
  v_control public.conveyancer_notification_controls%rowtype;
  v_orchestration public.conveyancer_orchestration_controls%rowtype;
  v_receipt public.conveyancer_application_receipts%rowtype;
  v_plan public.conveyancer_matter_plans%rowtype;
  v_signal jsonb;
  v_signal_type text;
  v_kind text;
  v_recipient uuid;
  v_recipient_role text;
  v_title text;
  v_message text;
  v_dedupe text;
  v_inserted integer := 0;
  v_duplicates integer := 0;
begin
  if v_user is null then raise exception 'Authentication is required.' using errcode = '42501'; end if;
  begin
    v_org := (payload ->> 'organisationId')::uuid;
    v_firm := (payload ->> 'attorneyFirmId')::uuid;
    v_tx := (payload ->> 'transactionId')::uuid;
  exception when invalid_text_representation then raise exception 'H4 notification identity is invalid.' using errcode = '22023';
  end;
  if coalesce(payload ->> 'version', '') <> 'conveyancer_notification_runtime_h4_v1' or v_event = '' or v_event_type = '' or length(v_projection) < 8
    or jsonb_typeof(payload -> 'signals') <> 'array' or jsonb_array_length(payload -> 'signals') > 20 then
    raise exception 'H4 notification provenance is incomplete.' using errcode = '22023';
  end if;
  if not public.bridge_conveyancer_can_access_record(v_org, v_firm, v_tx) then raise exception 'H4 matter access denied.' using errcode = '42501'; end if;
  if not exists(select 1 from public.attorney_firm_members m where m.firm_id = v_firm and m.user_id = v_user and m.status = 'active' and m.role in ('firm_admin','director_partner','transfer_attorney','conveyancing_secretary','admin_staff')) then
    raise exception 'H4 firm authority required.' using errcode = '42501';
  end if;
  select * into v_receipt from public.conveyancer_application_receipts r
    where r.organisation_id = v_org and r.attorney_firm_id = v_firm and r.transaction_id = v_tx and r.event_id = v_event and r.event_type = v_event_type;
  if not found then raise exception 'H4 source application receipt is missing.' using errcode = '22023'; end if;
  select * into v_control from public.conveyancer_notification_controls c where c.organisation_id = v_org and c.attorney_firm_id = v_firm order by c.revision desc limit 1;
  if not found or v_control.mode not in ('pilot','live') or v_control.kill_switch_enabled or (v_control.mode = 'pilot' and not(v_tx = any(v_control.pilot_transaction_ids))) then
    raise exception 'H4 notification delivery is disabled.' using errcode = '42501';
  end if;
  select * into v_orchestration from public.conveyancer_orchestration_controls c where c.organisation_id = v_org and c.attorney_firm_id = v_firm order by c.revision desc limit 1;
  if not found or v_orchestration.mode not in ('pilot','live') or v_orchestration.kill_switch_enabled or (v_orchestration.mode = 'pilot' and not(v_tx = any(v_orchestration.pilot_transaction_ids))) then
    raise exception 'H4 requires active matter orchestration.' using errcode = '42501';
  end if;
  select * into v_plan from public.conveyancer_matter_plans p where p.organisation_id = v_org and p.attorney_firm_id = v_firm and p.transaction_id = v_tx order by p.created_at desc limit 1;
  if not found then raise exception 'H4 current matter plan is missing.' using errcode = '22023'; end if;

  for v_signal in select value from jsonb_array_elements(payload -> 'signals') loop
    v_signal_type := lower(trim(coalesce(v_signal ->> 'signalType', '')));
    if v_signal_type not in ('exception_attention','coordination_attention','evidence_review','financial_reconciliation','closeout_review') then
      raise exception 'H4 notification signal type is invalid.' using errcode = '22023';
    end if;
    begin v_recipient := (v_signal ->> 'recipientUserId')::uuid;
    exception when invalid_text_representation then raise exception 'H4 recipient identity is invalid.' using errcode = '22023'; end;
    select lower(m.role) into v_recipient_role from public.attorney_firm_members m where m.firm_id = v_firm and m.user_id = v_recipient and m.status = 'active';
    if not found then raise exception 'H4 recipient is not an active member of the exact firm.' using errcode = '42501'; end if;
    if (v_signal_type in ('exception_attention','coordination_attention','closeout_review') and v_recipient_role not in ('firm_admin','director_partner','transfer_attorney'))
      or (v_signal_type = 'evidence_review' and v_recipient_role not in ('transfer_attorney','conveyancing_secretary'))
      or (v_signal_type = 'financial_reconciliation' and v_recipient_role not in ('admin_staff','firm_admin','director_partner')) then
      raise exception 'H4 recipient role is not eligible for this signal.' using errcode = '42501';
    end if;
    if length(trim(coalesce(v_signal ->> 'fingerprint', ''))) < 8 then raise exception 'H4 signal fingerprint is invalid.' using errcode = '22023'; end if;
    v_kind := case when v_signal_type in ('exception_attention','coordination_attention') then 'blocker_opened' else 'review_required' end;
    v_title := case v_signal_type
      when 'exception_attention' then 'Matter exception needs attention'
      when 'coordination_attention' then 'Professional coordination needs attention'
      when 'evidence_review' then 'New matter evidence needs review'
      when 'financial_reconciliation' then 'Financial reconciliation needs review'
      else 'Matter closeout needs review' end;
    v_message := case v_signal_type
      when 'exception_attention' then 'A reviewed matter observation opened an exception. Open the matter before deciding the next step.'
      when 'coordination_attention' then 'A professional coordination record changed and may need follow-up.'
      when 'evidence_review' then 'New evidence was recorded. Review it before relying on it as legal evidence.'
      when 'financial_reconciliation' then 'The matter financial model changed and requires an authorised review.'
      else 'A closeout assessment is ready for human review. The matter has not been closed automatically.' end;
    v_dedupe := 'h4:' || v_firm::text || ':' || v_event || ':' || v_signal_type || ':' || v_recipient::text;
    insert into public.conveyancer_notification_outbox(
      organisation_id, attorney_firm_id, transaction_id, control_id, plan_record_id, plan_revision,
      action_id, action_revision, notification_kind, channel, recipient_user_id, recipient_role,
      title, message, dedupe_key, intent_fingerprint, projection_fingerprint, available_at,
      metadata, created_by, source_type, source_event_id
    ) values(
      v_org, v_firm, v_tx, v_control.id, v_plan.record_id, v_plan.revision,
      'runtime:' || v_signal_type, 0, v_kind, 'in_app', v_recipient, v_recipient_role,
      v_title, v_message, v_dedupe, trim(v_signal ->> 'fingerprint'), v_projection, v_receipt.occurred_at,
      jsonb_build_object('source','conveyancer_h4','eventType',v_event_type,'signalType',v_signal_type,'legalTruth',false,'humanReviewRequired',true),
      v_user, 'runtime_event', v_event
    ) on conflict(attorney_firm_id, dedupe_key) do nothing;
    if found then v_inserted := v_inserted + 1; else v_duplicates := v_duplicates + 1; end if;
  end loop;
  return jsonb_build_object('ok',true,'queued',v_inserted,'duplicates',v_duplicates,'eventId',v_event);
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
    if v_control.id is null or v_orchestration.id is null or v_plan.id is null
      or v_control.kill_switch_enabled or v_control.mode not in ('pilot', 'live') or (v_control.mode = 'pilot' and not (v_row.transaction_id = any(v_control.pilot_transaction_ids)))
      or v_orchestration.kill_switch_enabled or v_orchestration.mode not in ('pilot', 'live') or (v_orchestration.mode = 'pilot' and not (v_row.transaction_id = any(v_orchestration.pilot_transaction_ids)))
      or not exists(select 1 from public.attorney_firm_members m where m.firm_id = v_row.attorney_firm_id and m.user_id = v_row.recipient_user_id and m.status = 'active')
      or (v_row.source_type = 'plan_action' and not exists (select 1 from jsonb_array_elements(coalesce(v_plan.payload -> 'actions', '[]'::jsonb)) action where action ->> 'key' = v_row.action_id and lower(coalesce(action ->> 'state', 'upcoming')) not in ('completed', 'cancelled')))
      or (v_row.source_type = 'runtime_event' and not exists(select 1 from public.conveyancer_application_receipts r where r.organisation_id = v_row.organisation_id and r.attorney_firm_id = v_row.attorney_firm_id and r.transaction_id = v_row.transaction_id and r.event_id = v_row.source_event_id)) then
      update public.conveyancer_notification_outbox set status = 'skipped', last_error = 'control_plan_recipient_or_source_changed', updated_at = now() where id = v_row.id;
      insert into public.conveyancer_notification_delivery_events(organisation_id, attorney_firm_id, transaction_id, outbox_id, event_type, detail) values(v_row.organisation_id, v_row.attorney_firm_id, v_row.transaction_id, v_row.id, 'skipped', jsonb_build_object('reason', 'control_plan_recipient_or_source_changed'));
      v_skipped := v_skipped + 1; continue;
    end if;
    v_reference := public.bridge_insert_invite_accepted_transaction_notification_phase2(v_row.transaction_id, v_row.recipient_user_id, 'attorney', v_row.title, v_row.message, v_row.dedupe_key, v_row.metadata || jsonb_build_object('source', 'conveyancer_h4', 'notificationKind', v_row.notification_kind, 'actionKey', v_row.action_id));
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

revoke all on function public.bridge_enqueue_conveyancer_notification_signal(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.bridge_enqueue_conveyancer_notification_signal(jsonb) to authenticated;
revoke all on function public.bridge_dispatch_conveyancer_notifications(integer, timestamptz) from public, anon, authenticated, service_role;
grant execute on function public.bridge_dispatch_conveyancer_notifications(integer, timestamptz) to service_role;

comment on function public.bridge_enqueue_conveyancer_notification_signal(jsonb) is 'H4 receipt-bound runtime notification enqueue. Copy is server-derived and cannot establish legal truth.';
notify pgrst, 'reload schema';
commit;
