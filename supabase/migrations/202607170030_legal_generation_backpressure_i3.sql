begin;

create table if not exists public.legal_document_generation_leases (
  packet_id uuid primary key references public.document_packets(id) on delete cascade,
  organisation_id uuid not null,
  generation_attempt_id uuid not null,
  claimed_by uuid,
  claimed_at timestamptz not null,
  expires_at timestamptz not null,
  check (expires_at > claimed_at)
);

alter table public.legal_document_generation_leases enable row level security;
revoke all on table public.legal_document_generation_leases from public, anon, authenticated;
grant select on table public.legal_document_generation_leases to service_role;

create or replace function public.bridge_claim_generation_lease_i3(
  p_packet_id uuid,
  p_generation_attempt_id uuid,
  p_ttl_seconds integer default 300
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_packet public.document_packets%rowtype;
  v_claimed uuid;
  v_now timestamptz := clock_timestamp();
  v_actor uuid := auth.uid();
begin
  if p_generation_attempt_id is null then raise exception 'Generation attempt ID is required.' using errcode = '22023'; end if;
  if p_ttl_seconds < 30 or p_ttl_seconds > 900 then raise exception 'Generation lease TTL must be between 30 and 900 seconds.' using errcode = '22023'; end if;
  if auth.role() <> 'service_role' and not public.bridge_can_access_legal_packet_h2(p_packet_id) then
    raise exception 'Packet generation authority is required.' using errcode = '42501';
  end if;
  select * into v_packet from public.document_packets where id = p_packet_id;
  if v_packet.id is null then raise exception 'Document packet not found.' using errcode = 'P0002'; end if;

  insert into public.legal_document_generation_leases (
    packet_id, organisation_id, generation_attempt_id, claimed_by, claimed_at, expires_at
  ) values (
    v_packet.id, v_packet.organisation_id, p_generation_attempt_id, v_actor, v_now, v_now + make_interval(secs => p_ttl_seconds)
  )
  on conflict (packet_id) do update set
    generation_attempt_id = excluded.generation_attempt_id,
    claimed_by = excluded.claimed_by,
    claimed_at = excluded.claimed_at,
    expires_at = excluded.expires_at
  where public.legal_document_generation_leases.expires_at <= v_now
     or public.legal_document_generation_leases.generation_attempt_id = excluded.generation_attempt_id
  returning packet_id into v_claimed;

  return v_claimed is not null;
end;
$$;

create or replace function public.bridge_release_generation_lease_i3(
  p_packet_id uuid,
  p_generation_attempt_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_released uuid;
begin
  if auth.role() <> 'service_role' and not public.bridge_can_access_legal_packet_h2(p_packet_id) then
    raise exception 'Packet generation authority is required.' using errcode = '42501';
  end if;
  delete from public.legal_document_generation_leases
  where packet_id = p_packet_id and generation_attempt_id = p_generation_attempt_id
  returning packet_id into v_released;
  return v_released is not null;
end;
$$;

create or replace function public.bridge_probe_generation_backpressure_i3(p_packet_id uuid, p_hold_ms integer default 250)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claimed boolean;
begin
  if auth.role() <> 'service_role' then raise exception 'Service-role capacity diagnostics are required.' using errcode = '42501'; end if;
  if p_hold_ms < 50 or p_hold_ms > 2000 then raise exception 'Probe hold must be between 50 and 2000 milliseconds.' using errcode = '22023'; end if;
  v_claimed := pg_try_advisory_xact_lock(hashtextextended(p_packet_id::text, 0));
  if v_claimed then perform pg_sleep(p_hold_ms::numeric / 1000); end if;
  return jsonb_build_object('contract', 'i3-v1', 'packetId', p_packet_id, 'claimed', v_claimed, 'mutatedData', false);
end;
$$;

create or replace function public.bridge_complete_generation_lease_i3()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attempt text;
begin
  v_attempt := coalesce(
    new.validation_summary_json->>'generationAttemptId',
    new.validation_summary_json#>>'{generationPayload,generationAttemptId}',
    new.validation_summary_json#>>'{render_provenance,generationAttemptId}'
  );
  if v_attempt ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    delete from public.legal_document_generation_leases
    where packet_id = new.packet_id and generation_attempt_id = v_attempt::uuid;
  end if;
  return new;
end;
$$;

drop trigger if exists document_packet_versions_complete_generation_lease_i3 on public.document_packet_versions;
create trigger document_packet_versions_complete_generation_lease_i3
after insert on public.document_packet_versions
for each row execute function public.bridge_complete_generation_lease_i3();

revoke all on function public.bridge_claim_generation_lease_i3(uuid, uuid, integer) from public, anon;
revoke all on function public.bridge_release_generation_lease_i3(uuid, uuid) from public, anon;
revoke all on function public.bridge_probe_generation_backpressure_i3(uuid, integer) from public, anon, authenticated;
grant execute on function public.bridge_claim_generation_lease_i3(uuid, uuid, integer) to authenticated, service_role;
grant execute on function public.bridge_release_generation_lease_i3(uuid, uuid) to authenticated, service_role;
grant execute on function public.bridge_probe_generation_backpressure_i3(uuid, integer) to service_role;

commit;
