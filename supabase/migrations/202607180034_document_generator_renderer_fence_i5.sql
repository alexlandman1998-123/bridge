begin;

create or replace function public.bridge_assert_generation_lease_i5(
  p_packet_id uuid,
  p_generation_attempt_id uuid,
  p_stage text
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_packet public.document_packets%rowtype;
  v_lease public.legal_document_generation_leases%rowtype;
  v_stage text:=lower(trim(coalesce(p_stage,'')));
  v_now timestamptz:=clock_timestamp();
begin
  if auth.role()<>'service_role' then raise exception 'Renderer fencing requires the service role.' using errcode='42501'; end if;
  if v_stage not in ('pre_render','pre_persist') then raise exception 'Renderer fence stage is invalid.' using errcode='22023'; end if;
  select * into v_packet from public.document_packets where id=p_packet_id;
  if v_packet.id is null then raise exception 'Document packet not found.' using errcode='P0002'; end if;
  select * into v_lease from public.legal_document_generation_leases where packet_id=p_packet_id;
  if v_lease.packet_id is null or v_lease.generation_attempt_id<>p_generation_attempt_id or v_lease.expires_at<=v_now then
    raise exception 'The renderer no longer owns the active generation attempt.' using errcode='55000',detail='I5_GENERATION_LEASE_FENCE_REJECTED';
  end if;
  if v_packet.status in ('sent','partially_signed','completed','voided','archived') then
    raise exception 'The packet became locked before rendering completed.' using errcode='55000',detail='I5_PACKET_LOCKED_DURING_RENDER';
  end if;
  return jsonb_build_object(
    'contract','i5-generator-v1','fenced',true,'packetId',p_packet_id,'stage',v_stage,
    'expiresAt',v_lease.expires_at,'mutatedData',false,'checkedAt',now()
  );
end;
$$;

revoke all on function public.bridge_assert_generation_lease_i5(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.bridge_assert_generation_lease_i5(uuid,uuid,text) to service_role;

create or replace function public.bridge_probe_renderer_fence_i5(p_packet_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_packet public.document_packets%rowtype;
  v_active_lease_count integer:=0;
  v_service_execute boolean:=false;
  v_authenticated_execute boolean:=true;
begin
  if auth.role()<>'service_role' then raise exception 'Renderer fence diagnostics require the service role.' using errcode='42501'; end if;
  select * into v_packet from public.document_packets where id=p_packet_id;
  if v_packet.id is null then raise exception 'Renderer fence target was not found.' using errcode='P0002'; end if;
  select count(*) into v_active_lease_count from public.legal_document_generation_leases
    where packet_id=p_packet_id and expires_at>clock_timestamp();
  select has_function_privilege('service_role','public.bridge_assert_generation_lease_i5(uuid,uuid,text)','EXECUTE') into v_service_execute;
  select has_function_privilege('authenticated','public.bridge_assert_generation_lease_i5(uuid,uuid,text)','EXECUTE') into v_authenticated_execute;
  return jsonb_build_object(
    'contract','i5-generator-diagnostic-v1','packetId',p_packet_id,'packetType',lower(v_packet.packet_type),
    'activeLeaseCount',v_active_lease_count,'serviceExecute',v_service_execute,
    'authenticatedExecute',v_authenticated_execute,'mutatedData',false,'checkedAt',now()
  );
end;
$$;

revoke all on function public.bridge_probe_renderer_fence_i5(uuid) from public,anon,authenticated;
grant execute on function public.bridge_probe_renderer_fence_i5(uuid) to service_role;

commit;
