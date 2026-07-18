begin;

create or replace function public.bridge_get_generation_attempt_status_i4(p_packet_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_packet public.document_packets%rowtype;
  v_lease public.legal_document_generation_leases%rowtype;
  v_now timestamptz:=clock_timestamp();
  v_active boolean:=false;
  v_retry_after integer:=0;
  v_completion_trigger_present boolean:=false;
begin
  if auth.role()<>'service_role' and not public.bridge_can_access_legal_packet_h2(p_packet_id) then
    raise exception 'Packet generation status authority is required.' using errcode='42501';
  end if;
  select * into v_packet from public.document_packets where id=p_packet_id;
  if v_packet.id is null then raise exception 'Document packet not found.' using errcode='P0002'; end if;
  select * into v_lease from public.legal_document_generation_leases where packet_id=p_packet_id;
  if v_lease.packet_id is not null then
    v_active:=v_lease.expires_at>v_now;
    v_retry_after:=greatest(0,ceil(extract(epoch from (v_lease.expires_at-v_now)))::integer);
  end if;
  select exists(
    select 1 from pg_trigger where tgrelid='public.document_packet_versions'::regclass
      and tgname='document_packet_versions_complete_generation_lease_i3' and not tgisinternal
  ) into v_completion_trigger_present;
  return jsonb_build_object(
    'contract','i4-generator-v1','packetId',v_packet.id,'packetType',lower(v_packet.packet_type),
    'generationStatus',case when v_active then 'active' when v_lease.packet_id is not null then 'expired' else 'idle' end,
    'active',v_active,'safeToRetry',not v_active,'retryAfterSeconds',v_retry_after,
    'claimedAt',case when v_active then v_lease.claimed_at else null end,
    'expiresAt',case when v_active then v_lease.expires_at else null end,
    'ownedByCurrentUser',v_active and auth.uid() is not null and v_lease.claimed_by=auth.uid(),
    'completionTriggerPresent',v_completion_trigger_present,
    'internalIdentifiersExcluded',true,'mutatedData',false,'checkedAt',now()
  );
end;
$$;

revoke all on function public.bridge_get_generation_attempt_status_i4(uuid) from public,anon;
grant execute on function public.bridge_get_generation_attempt_status_i4(uuid) to authenticated,service_role;

commit;
