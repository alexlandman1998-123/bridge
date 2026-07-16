begin;

alter table public.conveyancer_provider_kill_switches
  add column if not exists component text not null default 'providers',
  add column if not exists request_id text;
alter table public.conveyancer_provider_kill_switches drop constraint if exists conveyancer_provider_kill_switches_component_check;
alter table public.conveyancer_provider_kill_switches add constraint conveyancer_provider_kill_switches_component_check
  check (component in ('all', 'orchestration', 'notifications', 'documents', 'providers'));
create unique index if not exists conveyancer_kill_switch_h8_request_idx
  on public.conveyancer_provider_kill_switches(coalesce(attorney_firm_id, '00000000-0000-0000-0000-000000000000'::uuid), request_id)
  where request_id is not null;

create table if not exists public.conveyancer_application_health_snapshots (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('global', 'firm')),
  organisation_id uuid references public.organisations(id) on delete restrict,
  attorney_firm_id uuid references public.attorney_firms(id) on delete restrict,
  health text not null check (health in ('pass', 'warning', 'fail')),
  component_health jsonb not null check (jsonb_typeof(component_health) = 'object'),
  metrics jsonb not null check (jsonb_typeof(metrics) = 'object' and octet_length(metrics::text) <= 16384),
  blockers text[] not null default '{}'::text[], warnings text[] not null default '{}'::text[],
  contract_version text not null default 'conveyancer_operational_application_h8_v1',
  captured_at timestamptz not null default now(),
  check ((scope = 'global' and organisation_id is null and attorney_firm_id is null)
    or (scope = 'firm' and organisation_id is not null and attorney_firm_id is not null))
);
create index if not exists conveyancer_application_health_scope_idx
  on public.conveyancer_application_health_snapshots(scope, organisation_id, attorney_firm_id, captured_at desc);
alter table public.conveyancer_application_health_snapshots enable row level security;
revoke all on public.conveyancer_application_health_snapshots from anon, authenticated, service_role;
grant select on public.conveyancer_application_health_snapshots to authenticated, service_role;
create policy conveyancer_application_health_read on public.conveyancer_application_health_snapshots
  for select to authenticated using (
    public.bridge_is_platform_admin() or (scope = 'firm' and public.bridge_conveyancer_can_access_record(organisation_id, attorney_firm_id, null::uuid))
  );
drop trigger if exists conveyancer_application_health_immutable on public.conveyancer_application_health_snapshots;
create trigger conveyancer_application_health_immutable before update or delete on public.conveyancer_application_health_snapshots
  for each row execute function public.bridge_conveyancer_reject_mutation();

create or replace function public.bridge_conveyancer_provider_operation_allowed(p_organisation_id uuid, p_attorney_firm_id uuid, p_profile_id uuid, p_direction text)
returns boolean language sql stable security definer set search_path = public as $$
  with latest as (select distinct on(record_id) * from public.conveyancer_provider_kill_switches order by record_id, revision desc)
  select not exists(
    select 1 from latest where enabled and component in ('all', 'providers') and (expires_at is null or expires_at > now())
      and (direction = 'all' or direction = p_direction)
      and (scope = 'global' or (scope = 'organisation' and organisation_id = p_organisation_id)
        or (scope = 'firm' and organisation_id = p_organisation_id and attorney_firm_id = p_attorney_firm_id)
        or (scope = 'profile' and organisation_id = p_organisation_id and attorney_firm_id = p_attorney_firm_id and integration_profile_id = p_profile_id))
  )
$$;

create or replace function public.bridge_conveyancer_application_operation_allowed_h8(p_organisation_id uuid, p_attorney_firm_id uuid, p_component text)
returns boolean language sql stable security definer set search_path = public as $$
  with latest as (select distinct on(record_id) * from public.conveyancer_provider_kill_switches order by record_id, revision desc)
  select not exists(
    select 1 from latest where enabled and component in ('all', lower(p_component)) and (expires_at is null or expires_at > now())
      and direction = 'all'
      and (scope = 'global' or (scope = 'organisation' and organisation_id = p_organisation_id)
        or (scope = 'firm' and organisation_id = p_organisation_id and attorney_firm_id = p_attorney_firm_id))
  )
$$;

create or replace function public.bridge_set_conveyancer_application_kill_switch_h8(payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid(); v_scope text := lower(payload ->> 'scope'); v_component text := lower(payload ->> 'component');
  v_direction text := lower(coalesce(payload ->> 'direction', 'all')); v_org uuid; v_firm uuid; v_profile uuid;
  v_record uuid; v_revision integer; v_id uuid; v_existing public.conveyancer_provider_kill_switches%rowtype; v_request text := trim(payload ->> 'requestId');
begin
  if v_user is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  begin v_org := nullif(payload ->> 'organisationId', '')::uuid; v_firm := nullif(payload ->> 'attorneyFirmId', '')::uuid; v_profile := nullif(payload ->> 'profileId', '')::uuid;
  exception when invalid_text_representation then raise exception 'H8 kill-switch identity invalid.' using errcode = '22023'; end;
  if not public.bridge_is_platform_admin() and not (v_scope = 'firm' and public.attorney_user_is_firm_admin(v_firm) and exists(select 1 from public.attorney_firms where id = v_firm and organisation_id = v_org)) then raise exception 'H8 kill-switch authority required.' using errcode = '42501'; end if;
  if coalesce(payload ->> 'version', '') <> 'conveyancer_operational_application_h8_v1' or v_scope not in ('global','organisation','firm','profile')
    or v_component not in ('all','orchestration','notifications','documents','providers') or v_direction not in ('all','inbound','outbound')
    or (v_component <> 'providers' and v_direction <> 'all') or (v_scope = 'profile' and v_component <> 'providers')
    or v_request = '' or length(v_request) > 200 or trim(coalesce(payload ->> 'reason','')) = ''
    or payload ->> 'requestedBy' <> v_user::text or length(trim(coalesce(payload ->> 'fingerprint',''))) < 8 then raise exception 'H8 kill-switch contract invalid.' using errcode = '22023'; end if;
  select * into v_existing from public.conveyancer_provider_kill_switches where request_id = v_request and attorney_firm_id is not distinct from v_firm;
  if found then
    if v_existing.component <> v_component or v_existing.enabled <> coalesce((payload ->> 'enabled')::boolean, false) or v_existing.reason <> payload ->> 'reason' then raise exception 'H8 kill-switch idempotency conflict.' using errcode = '23505'; end if;
    return jsonb_build_object('ok', true, 'duplicate', true, 'id', v_existing.id, 'enabled', v_existing.enabled);
  end if;
  select record_id, revision + 1 into v_record, v_revision from public.conveyancer_provider_kill_switches
  where scope = v_scope and component = v_component and organisation_id is not distinct from v_org and attorney_firm_id is not distinct from v_firm
    and integration_profile_id is not distinct from v_profile and direction = v_direction order by revision desc limit 1;
  insert into public.conveyancer_provider_kill_switches(record_id, revision, scope, organisation_id, attorney_firm_id, integration_profile_id, direction, component, request_id, enabled, reason, incident_record_id, expires_at, contract_version, fingerprint, created_by)
  values(coalesce(v_record, gen_random_uuid()), coalesce(v_revision, 1), v_scope, v_org, v_firm, v_profile, v_direction, v_component, v_request,
    coalesce((payload ->> 'enabled')::boolean, false), payload ->> 'reason', nullif(payload ->> 'incidentId','')::uuid, nullif(payload ->> 'expiresAt','')::timestamptz,
    'conveyancer_operational_application_h8_v1', payload ->> 'fingerprint', v_user) returning id into v_id;
  return jsonb_build_object('ok', true, 'duplicate', false, 'id', v_id, 'revision', coalesce(v_revision, 1), 'enabled', coalesce((payload ->> 'enabled')::boolean, false));
end $$;

create or replace function public.bridge_conveyancer_h8_guard_component()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_component text := tg_argv[0];
begin
  if not public.bridge_conveyancer_application_operation_allowed_h8(new.organisation_id, new.attorney_firm_id, v_component) then
    raise exception 'H8 application kill switch is active for %.', v_component using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists conveyancer_h8_orchestration_guard on public.conveyancer_application_receipts;
create trigger conveyancer_h8_orchestration_guard before insert on public.conveyancer_application_receipts for each row execute function public.bridge_conveyancer_h8_guard_component('orchestration');
drop trigger if exists conveyancer_h8_notification_guard on public.conveyancer_notification_outbox;
create trigger conveyancer_h8_notification_guard before insert on public.conveyancer_notification_outbox for each row execute function public.bridge_conveyancer_h8_guard_component('notifications');
drop trigger if exists conveyancer_h8_document_guard on public.conveyancer_document_jobs;
create trigger conveyancer_h8_document_guard before insert on public.conveyancer_document_jobs for each row execute function public.bridge_conveyancer_h8_guard_component('documents');

create or replace function public.bridge_capture_conveyancer_application_health_h8(p_now timestamptz default now())
returns jsonb language plpgsql security definer set search_path = public as $$
declare f record; m jsonb; c jsonb; v_health text; v_blockers text[]; v_warnings text[]; v_firms integer := 0; v_failed integer := 0; v_warning integer := 0;
begin
  for f in
    select distinct organisation_id, attorney_firm_id from (
      select organisation_id, attorney_firm_id from public.conveyancer_orchestration_controls
      union select organisation_id, attorney_firm_id from public.conveyancer_notification_controls
      union select organisation_id, attorney_firm_id from public.conveyancer_document_pipeline_controls
      union select organisation_id, attorney_firm_id from public.conveyancer_provider_transport_controls
    ) firms where organisation_id is not null and attorney_firm_id is not null
  loop
    select jsonb_build_object(
      'orchestrationReceipts24h', (select count(*) from public.conveyancer_application_receipts where organisation_id=f.organisation_id and attorney_firm_id=f.attorney_firm_id and occurred_at >= p_now - interval '24 hours'),
      'notificationQueued', (select count(*) from public.conveyancer_notification_outbox where organisation_id=f.organisation_id and attorney_firm_id=f.attorney_firm_id and status in ('queued','processing')),
      'notificationFailed', (select count(*) from public.conveyancer_notification_outbox where organisation_id=f.organisation_id and attorney_firm_id=f.attorney_firm_id and status='failed'),
      'documentProcessing', (select count(*) from public.conveyancer_document_jobs where organisation_id=f.organisation_id and attorney_firm_id=f.attorney_firm_id and status in ('queued','processing')),
      'documentFailed', (select count(*) from public.conveyancer_document_jobs where organisation_id=f.organisation_id and attorney_firm_id=f.attorney_firm_id and status='failed'),
      'providerRecovering', (select count(*) from public.conveyancer_provider_outbound_commands where organisation_id=f.organisation_id and attorney_firm_id=f.attorney_firm_id and status in ('queued','leased','retry_scheduled')),
      'providerFailed', (select count(*) from public.conveyancer_provider_outbound_commands where organisation_id=f.organisation_id and attorney_firm_id=f.attorney_firm_id and status in ('dead_letter','reconciliation_required')),
      'inboundAwaitingReview', (select count(*) from public.conveyancer_provider_inbound_envelopes where organisation_id=f.organisation_id and attorney_firm_id=f.attorney_firm_id and status='awaiting_review')
    ) into m;
    v_blockers := '{}'::text[]; v_warnings := '{}'::text[];
    if (m->>'notificationFailed')::integer > 0 then v_blockers := array_append(v_blockers, 'notification_failures_present'); end if;
    if (m->>'documentFailed')::integer > 0 then v_blockers := array_append(v_blockers, 'document_failures_present'); end if;
    if (m->>'providerFailed')::integer > 0 then v_blockers := array_append(v_blockers, 'provider_transport_failures_present'); end if;
    if (m->>'notificationQueued')::integer > 100 or (m->>'documentProcessing')::integer > 25 or (m->>'providerRecovering')::integer > 100 or (m->>'inboundAwaitingReview')::integer > 25 then v_warnings := array_append(v_warnings, 'application_backlog_present'); end if;
    v_health := case when cardinality(v_blockers)>0 then 'fail' when cardinality(v_warnings)>0 then 'warning' else 'pass' end;
    c := jsonb_build_object('orchestration','pass','notifications',case when (m->>'notificationFailed')::integer>0 then 'fail' else 'pass' end,'documents',case when (m->>'documentFailed')::integer>0 then 'fail' else 'pass' end,'providers',case when (m->>'providerFailed')::integer>0 then 'fail' else 'pass' end);
    insert into public.conveyancer_application_health_snapshots(scope,organisation_id,attorney_firm_id,health,component_health,metrics,blockers,warnings,captured_at)
    values('firm',f.organisation_id,f.attorney_firm_id,v_health,c,m,v_blockers,v_warnings,p_now);
    v_firms:=v_firms+1; if v_health='fail' then v_failed:=v_failed+1; elsif v_health='warning' then v_warning:=v_warning+1; end if;
  end loop;
  insert into public.conveyancer_application_health_snapshots(scope,health,component_health,metrics,blockers,warnings,captured_at)
  values('global',case when v_failed>0 then 'fail' when v_warning>0 then 'warning' else 'pass' end,'{}'::jsonb,jsonb_build_object('firms',v_firms,'failingFirms',v_failed,'warningFirms',v_warning),case when v_failed>0 then array['application_health_failures']::text[] else '{}'::text[] end,case when v_warning>0 then array['application_health_warnings']::text[] else '{}'::text[] end,p_now);
  return jsonb_build_object('ok',true,'firms',v_firms,'failingFirms',v_failed,'warningFirms',v_warning,'capturedAt',p_now);
end $$;

create or replace function public.bridge_authorise_conveyancer_release_h8(p_release_candidate_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_snapshot public.conveyancer_application_health_snapshots%rowtype;
begin
  select * into v_snapshot from public.conveyancer_application_health_snapshots where scope='global' order by captured_at desc limit 1;
  if not found or v_snapshot.health <> 'pass' or v_snapshot.captured_at < now() - interval '5 minutes' then
    return jsonb_build_object('ok',false,'blocked',true,'reason','application_health_gate_failed');
  end if;
  return public.bridge_authorise_conveyancer_release(p_release_candidate_id,p_reason);
end $$;

create or replace function public.bridge_guard_conveyancer_release_activation_h8()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_snapshot public.conveyancer_application_health_snapshots%rowtype;
begin
  if new.event_type = 'activated' then
    select * into v_snapshot from public.conveyancer_application_health_snapshots where scope='global' order by captured_at desc limit 1;
    if not found or v_snapshot.health <> 'pass' or v_snapshot.captured_at < now() - interval '5 minutes' then raise exception 'H8 deployment application-health gate closed.' using errcode='42501'; end if;
  end if;
  return new;
end $$;
drop trigger if exists conveyancer_release_activation_h8_guard on public.conveyancer_release_events;
create trigger conveyancer_release_activation_h8_guard before insert on public.conveyancer_release_events for each row execute function public.bridge_guard_conveyancer_release_activation_h8();

revoke all on function public.bridge_conveyancer_application_operation_allowed_h8(uuid,uuid,text), public.bridge_set_conveyancer_application_kill_switch_h8(jsonb), public.bridge_capture_conveyancer_application_health_h8(timestamptz), public.bridge_authorise_conveyancer_release_h8(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.bridge_conveyancer_application_operation_allowed_h8(uuid,uuid,text) to authenticated,service_role;
grant execute on function public.bridge_set_conveyancer_application_kill_switch_h8(jsonb), public.bridge_authorise_conveyancer_release_h8(uuid,text) to authenticated;
grant execute on function public.bridge_capture_conveyancer_application_health_h8(timestamptz) to service_role;

comment on table public.conveyancer_application_health_snapshots is 'H8 combined H2-H7 operational health used by the deployment gate; no matter payloads are retained.';
comment on function public.bridge_conveyancer_application_operation_allowed_h8(uuid,uuid,text) is 'H8 component stop plane; manual conveyancing remains available.';
notify pgrst, 'reload schema';
commit;
