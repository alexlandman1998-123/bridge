begin;

create index if not exists legal_document_generation_leases_expiry_i3_idx
  on public.legal_document_generation_leases (expires_at);

create or replace function public.bridge_claim_generation_lease_i3(
  p_packet_id uuid,
  p_generation_attempt_id uuid,
  p_ttl_seconds integer default 300
)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
declare
  v_packet public.document_packets%rowtype;
  v_claimed uuid;
  v_now timestamptz:=clock_timestamp();
  v_actor uuid:=auth.uid();
begin
  if p_generation_attempt_id is null then raise exception 'Generation attempt ID is required.' using errcode='22023'; end if;
  if p_ttl_seconds<30 or p_ttl_seconds>900 then raise exception 'Generation lease TTL must be between 30 and 900 seconds.' using errcode='22023'; end if;
  if auth.role()<>'service_role' and not public.bridge_can_access_legal_packet_h2(p_packet_id) then
    raise exception 'Packet generation authority is required.' using errcode='42501';
  end if;
  select * into v_packet from public.document_packets where id=p_packet_id for update;
  if v_packet.id is null then raise exception 'Document packet not found.' using errcode='P0002'; end if;
  if v_packet.status in ('sent','partially_signed','completed','voided','archived') then
    raise exception 'This packet is locked and cannot be generated again.' using errcode='55000',detail='I3_PACKET_GENERATION_LOCKED';
  end if;
  insert into public.legal_document_generation_leases (
    packet_id,organisation_id,generation_attempt_id,claimed_by,claimed_at,expires_at
  ) values (
    v_packet.id,v_packet.organisation_id,p_generation_attempt_id,v_actor,v_now,v_now+make_interval(secs=>p_ttl_seconds)
  )
  on conflict (packet_id) do update set
    generation_attempt_id=excluded.generation_attempt_id,claimed_by=excluded.claimed_by,
    claimed_at=excluded.claimed_at,expires_at=excluded.expires_at
  where public.legal_document_generation_leases.expires_at<=v_now
  returning packet_id into v_claimed;
  return v_claimed is not null;
end;
$$;

create or replace function public.bridge_probe_document_generator_backpressure_i3(p_packet_id uuid,p_hold_ms integer default 250)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_packet public.document_packets%rowtype;
  v_claimed boolean;
  v_active_lease_count integer:=0;
  v_primary_key_present boolean:=false;
  v_completion_trigger_present boolean:=false;
  v_expiry_index_present boolean:=false;
begin
  if auth.role()<>'service_role' then raise exception 'Backpressure diagnostics require the service role.' using errcode='42501'; end if;
  if p_hold_ms<50 or p_hold_ms>2000 then raise exception 'Probe hold must be between 50 and 2000 milliseconds.' using errcode='22023'; end if;
  select * into v_packet from public.document_packets where id=p_packet_id;
  if v_packet.id is null then raise exception 'Backpressure target was not found.' using errcode='P0002'; end if;
  select count(*) into v_active_lease_count from public.legal_document_generation_leases
    where packet_id=p_packet_id and expires_at>clock_timestamp();
  select exists(
    select 1 from pg_constraint where conrelid='public.legal_document_generation_leases'::regclass and contype='p'
  ) into v_primary_key_present;
  select exists(
    select 1 from pg_trigger where tgrelid='public.document_packet_versions'::regclass
      and tgname='document_packet_versions_complete_generation_lease_i3' and not tgisinternal
  ) into v_completion_trigger_present;
  select exists(
    select 1 from pg_indexes where schemaname='public' and tablename='legal_document_generation_leases'
      and indexname='legal_document_generation_leases_expiry_i3_idx'
  ) into v_expiry_index_present;
  v_claimed:=pg_try_advisory_xact_lock(hashtextextended(p_packet_id::text,0));
  if v_claimed then perform pg_sleep(p_hold_ms::numeric/1000); end if;
  return jsonb_build_object(
    'contract','i3-generator-v1','packetId',p_packet_id,'packetType',lower(v_packet.packet_type),
    'claimed',v_claimed,'activeLeaseCount',v_active_lease_count,'primaryKeyPresent',v_primary_key_present,
    'completionTriggerPresent',v_completion_trigger_present,'expiryIndexPresent',v_expiry_index_present,
    'mutatedData',false,'checkedAt',now()
  );
end;
$$;

revoke all on function public.bridge_probe_document_generator_backpressure_i3(uuid,integer) from public,anon,authenticated;
grant execute on function public.bridge_probe_document_generator_backpressure_i3(uuid,integer) to service_role;

commit;
