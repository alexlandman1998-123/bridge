begin;

-- Phase 5 operational evidence is intentionally append-only.  The generic
-- system_health_snapshots table also supports other platform domains, so keep
-- this boundary narrow: it applies only to the legal-document watchdog and
-- its acknowledgement events.
create or replace function public.bridge_enforce_legal_document_health_snapshot_append_only_phase5()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_kind text;
  v_new_kind text;
begin
  if tg_op = 'INSERT' then
    v_new_kind := lower(coalesce(new.summary->>'kind', ''));
    if v_new_kind in (
      'legal_document_watchdog_v1',
      'legal_document_incident_acknowledgement_v1'
    ) and coalesce(auth.role(), '') <> 'service_role' then
      raise exception 'Legal-document health snapshots require service-role authority.'
        using errcode = '42501', detail = 'PHASE5_LEGAL_DOCUMENT_HEALTH_SERVICE_ROLE_REQUIRED';
    end if;
    if v_new_kind = 'legal_document_incident_acknowledgement_v1'
      and coalesce(current_setting('bridge.legal_document_incident_acknowledgement', true), '') <> 'phase5-rpc' then
      raise exception 'Legal-document incident acknowledgements must use the Phase 5 acknowledgement RPC.'
        using errcode = '42501', detail = 'PHASE5_INCIDENT_ACK_RPC_REQUIRED';
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    v_old_kind := lower(coalesce(old.summary->>'kind', ''));
    v_new_kind := lower(coalesce(new.summary->>'kind', ''));
    if v_old_kind in (
      'legal_document_watchdog_v1',
      'legal_document_incident_acknowledgement_v1'
    ) or v_new_kind in (
      'legal_document_watchdog_v1',
      'legal_document_incident_acknowledgement_v1'
    ) then
      raise exception 'Legal-document health snapshots are immutable append-only evidence.'
        using errcode = '55000', detail = 'PHASE5_LEGAL_DOCUMENT_HEALTH_SNAPSHOT_IMMUTABLE';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    v_old_kind := lower(coalesce(old.summary->>'kind', ''));
    if v_old_kind in (
      'legal_document_watchdog_v1',
      'legal_document_incident_acknowledgement_v1'
    ) then
      raise exception 'Legal-document health snapshots are immutable append-only evidence.'
        using errcode = '55000', detail = 'PHASE5_LEGAL_DOCUMENT_HEALTH_SNAPSHOT_IMMUTABLE';
    end if;
    return old;
  end if;

  raise exception 'Unsupported legal-document health snapshot operation.' using errcode = '0A000';
end;
$$;

drop trigger if exists trg_phase5_legal_document_health_snapshot_append_only on public.system_health_snapshots;
create trigger trg_phase5_legal_document_health_snapshot_append_only
before insert or update or delete on public.system_health_snapshots
for each row execute function public.bridge_enforce_legal_document_health_snapshot_append_only_phase5();

-- A snapshot is useful evidence, but the acknowledgement needs its own
-- durable, referentially bound record so incident ownership cannot be inferred
-- from mutable JSON alone.
create table if not exists public.legal_document_incident_acknowledgements (
  id uuid primary key default gen_random_uuid(),
  incident_snapshot_id uuid not null references public.system_health_snapshots(id) on delete restrict,
  acknowledgement_snapshot_id uuid not null unique references public.system_health_snapshots(id) on delete restrict,
  acknowledged_owner text not null,
  acknowledgement_note text not null,
  acknowledged_by uuid not null references auth.users(id) on delete restrict,
  acknowledged_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint legal_document_incident_acknowledgements_owner_check
    check (char_length(btrim(acknowledged_owner)) between 1 and 160),
  constraint legal_document_incident_acknowledgements_note_check
    check (char_length(btrim(acknowledgement_note)) between 1 and 2000)
);

create index if not exists legal_document_incident_acknowledgements_incident_idx
  on public.legal_document_incident_acknowledgements (incident_snapshot_id, acknowledged_at desc);

alter table public.legal_document_incident_acknowledgements enable row level security;
revoke all on table public.legal_document_incident_acknowledgements from public, anon, authenticated, service_role;
grant select on table public.legal_document_incident_acknowledgements to service_role;

-- Even a database operator with table access cannot attach an acknowledgement
-- to an arbitrary snapshot: the target must be the immutable critical
-- watchdog event, and the acknowledgement snapshot must bind the same actor,
-- owner, note, and incident id as this durable row.
create or replace function public.bridge_enforce_legal_document_incident_ack_append_only_phase5()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_incident public.system_health_snapshots%rowtype;
  v_acknowledgement public.system_health_snapshots%rowtype;
begin
  if tg_op <> 'INSERT' then
    raise exception 'Legal-document incident acknowledgements are immutable append-only evidence.'
      using errcode = '55000', detail = 'PHASE5_LEGAL_DOCUMENT_INCIDENT_ACK_IMMUTABLE';
  end if;

  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Legal-document incident acknowledgement requires service-role authority.'
      using errcode = '42501', detail = 'PHASE5_LEGAL_DOCUMENT_INCIDENT_ACK_SERVICE_ROLE_REQUIRED';
  end if;

  select * into v_incident
  from public.system_health_snapshots
  where id = new.incident_snapshot_id
  for key share;
  if not found
    or lower(coalesce(v_incident.summary->>'kind', '')) <> 'legal_document_watchdog_v1'
    or coalesce(v_incident.status, '') <> 'critical' then
    raise exception 'Incident acknowledgement must reference a critical legal-document watchdog snapshot.'
      using errcode = '22000', detail = 'PHASE5_CRITICAL_WATCHDOG_SNAPSHOT_REQUIRED';
  end if;

  select * into v_acknowledgement
  from public.system_health_snapshots
  where id = new.acknowledgement_snapshot_id
  for key share;
  if not found
    or lower(coalesce(v_acknowledgement.summary->>'kind', '')) <> 'legal_document_incident_acknowledgement_v1'
    or coalesce(v_acknowledgement.status, '') <> 'warning'
    or v_acknowledgement.created_by is distinct from new.acknowledged_by
    or coalesce(v_acknowledgement.summary->>'incidentId', '') <> new.incident_snapshot_id::text
    or coalesce(v_acknowledgement.summary->>'owner', '') <> new.acknowledged_owner
    or coalesce(v_acknowledgement.summary->>'note', '') <> new.acknowledgement_note
    or coalesce(v_acknowledgement.summary->>'actorId', '') <> new.acknowledged_by::text then
    raise exception 'Incident acknowledgement snapshot is not bound to its durable acknowledgement record.'
      using errcode = '22000', detail = 'PHASE5_INCIDENT_ACKNOWLEDGEMENT_BINDING_INVALID';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_phase5_legal_document_incident_ack_append_only on public.legal_document_incident_acknowledgements;
create trigger trg_phase5_legal_document_incident_ack_append_only
before insert or update or delete on public.legal_document_incident_acknowledgements
for each row execute function public.bridge_enforce_legal_document_incident_ack_append_only_phase5();

create or replace function public.bridge_acknowledge_legal_document_incident_phase5(
  p_incident_snapshot_id uuid,
  p_owner text,
  p_note text,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_incident public.system_health_snapshots%rowtype;
  v_acknowledgement_snapshot_id uuid;
  v_acknowledgement_id uuid;
  v_owner text := btrim(coalesce(p_owner, ''));
  v_note text := btrim(coalesce(p_note, ''));
  v_acknowledged_at timestamptz := now();
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service-role incident acknowledgement authority is required.'
      using errcode = '42501', detail = 'PHASE5_INCIDENT_ACK_SERVICE_ROLE_REQUIRED';
  end if;

  if p_incident_snapshot_id is null then
    raise exception 'A critical watchdog snapshot id is required.'
      using errcode = '22000', detail = 'PHASE5_INCIDENT_SNAPSHOT_REQUIRED';
  end if;
  if p_actor_id is null or not exists (select 1 from auth.users where id = p_actor_id) then
    raise exception 'A valid accountable actor UUID is required.'
      using errcode = '22000', detail = 'PHASE5_ACCOUNTABLE_ACTOR_REQUIRED';
  end if;
  if char_length(v_owner) not between 1 and 160 then
    raise exception 'Acknowledgement owner must contain between 1 and 160 characters.'
      using errcode = '22000', detail = 'PHASE5_ACKNOWLEDGEMENT_OWNER_INVALID';
  end if;
  if char_length(v_note) not between 1 and 2000 then
    raise exception 'Acknowledgement note must contain between 1 and 2000 characters.'
      using errcode = '22000', detail = 'PHASE5_ACKNOWLEDGEMENT_NOTE_INVALID';
  end if;

  select * into v_incident
  from public.system_health_snapshots
  where id = p_incident_snapshot_id
  for key share;
  if not found
    or lower(coalesce(v_incident.summary->>'kind', '')) <> 'legal_document_watchdog_v1'
    or coalesce(v_incident.status, '') <> 'critical' then
    raise exception 'Only a critical legal-document watchdog snapshot can be acknowledged.'
      using errcode = '22000', detail = 'PHASE5_CRITICAL_WATCHDOG_SNAPSHOT_REQUIRED';
  end if;

  perform set_config('bridge.legal_document_incident_acknowledgement', 'phase5-rpc', true);

  insert into public.system_health_snapshots (
    status,
    summary,
    created_by,
    created_at
  )
  values (
    'warning',
    jsonb_build_object(
      'kind', 'legal_document_incident_acknowledgement_v1',
      'contract', 'phase5-legal-document-incident-acknowledgement-v1',
      'incidentId', v_incident.id,
      'owner', v_owner,
      'note', v_note,
      'incidentStatus', v_incident.status,
      'acknowledgedAt', v_acknowledged_at,
      'actorId', p_actor_id
    ),
    p_actor_id,
    v_acknowledged_at
  )
  returning id into v_acknowledgement_snapshot_id;

  insert into public.legal_document_incident_acknowledgements (
    incident_snapshot_id,
    acknowledgement_snapshot_id,
    acknowledged_owner,
    acknowledgement_note,
    acknowledged_by,
    acknowledged_at,
    created_at
  )
  values (
    v_incident.id,
    v_acknowledgement_snapshot_id,
    v_owner,
    v_note,
    p_actor_id,
    v_acknowledged_at,
    v_acknowledged_at
  )
  returning id into v_acknowledgement_id;

  return jsonb_build_object(
    'contract', 'phase5-legal-document-incident-acknowledgement-v1',
    'acknowledgementId', v_acknowledgement_id,
    'acknowledgementSnapshotId', v_acknowledgement_snapshot_id,
    'incidentId', v_incident.id,
    'incidentStatus', v_incident.status,
    'owner', v_owner,
    'note', v_note,
    'actorId', p_actor_id,
    'acknowledgedAt', v_acknowledged_at
  );
end;
$$;

revoke all on function public.bridge_enforce_legal_document_health_snapshot_append_only_phase5() from public, anon, authenticated, service_role;
revoke all on function public.bridge_enforce_legal_document_incident_ack_append_only_phase5() from public, anon, authenticated, service_role;
revoke all on function public.bridge_acknowledge_legal_document_incident_phase5(uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.bridge_acknowledge_legal_document_incident_phase5(uuid, text, text, uuid) to service_role;

comment on table public.legal_document_incident_acknowledgements is
  'Phase 5 append-only legal-document incident acknowledgement ledger. Each row is bound to one immutable critical watchdog snapshot and one immutable acknowledgement snapshot.';
comment on function public.bridge_acknowledge_legal_document_incident_phase5(uuid, text, text, uuid) is
  'Phase 5 service-only atomic acknowledgement: records an immutable acknowledgement snapshot and actor-bound incident ledger row for a critical legal-document watchdog event.';

notify pgrst, 'reload schema';

commit;
