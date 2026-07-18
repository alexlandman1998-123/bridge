begin;

create table if not exists public.legal_final_completion_retry_attempts (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  packet_id uuid not null references public.document_packets(id) on delete cascade,
  packet_version_id uuid not null references public.document_packet_versions(id) on delete cascade,
  requested_by uuid,
  status text not null check (status in ('processing','completed','failed')),
  outcome_json jsonb not null default '{}'::jsonb,
  requested_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists legal_final_completion_retry_target_f5_idx
  on public.legal_final_completion_retry_attempts(packet_version_id,requested_at desc);
alter table public.legal_final_completion_retry_attempts enable row level security;
revoke all on table public.legal_final_completion_retry_attempts from public,anon;
grant select on table public.legal_final_completion_retry_attempts to authenticated;
drop policy if exists final_completion_retry_access_f5 on public.legal_final_completion_retry_attempts;
create policy final_completion_retry_access_f5 on public.legal_final_completion_retry_attempts
for select to authenticated using (public.bridge_can_access_legal_packet_h2(packet_id));

create or replace function public.bridge_get_final_completion_status_f5(p_packet_id uuid,p_packet_version_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_packet public.document_packets%rowtype;
  v_version public.document_packet_versions%rowtype;
  v_publication public.legal_final_transaction_publications%rowtype;
  v_receipt public.legal_final_completion_receipts%rowtype;
  v_signer_count integer:=0;
  v_delivered_count integer:=0;
  v_failed_count integer:=0;
  v_ready boolean;
  v_stage text;
begin
  if auth.role()<>'service_role' and not public.bridge_can_access_legal_packet_h2(p_packet_id) then
    raise exception 'Final completion status is unavailable.' using errcode='42501';
  end if;
  select * into v_packet from public.document_packets where id=p_packet_id;
  select * into v_version from public.document_packet_versions where id=p_packet_version_id and packet_id=p_packet_id;
  if v_packet.id is null or v_version.id is null then raise exception 'Packet completion target was not found.' using errcode='P0002'; end if;
  select * into v_publication from public.legal_final_transaction_publications where packet_version_id=v_version.id;
  select * into v_receipt from public.legal_final_completion_receipts where packet_version_id=v_version.id;
  select count(*) into v_signer_count from public.document_packet_signers where packet_version_id=v_version.id;
  select count(*) into v_delivered_count from public.document_packet_signers signer where signer.packet_version_id=v_version.id and exists (
    select 1 from public.legal_final_artifact_deliveries delivery where delivery.packet_version_id=v_version.id
      and delivery.signer_id=signer.id and delivery.status='sent' and coalesce(delivery.provider_message_id,'')<>''
  );
  select count(*) into v_failed_count from public.document_packet_signers signer where signer.packet_version_id=v_version.id
    and not exists (select 1 from public.legal_final_artifact_deliveries delivery where delivery.packet_version_id=v_version.id and delivery.signer_id=signer.id and delivery.status='sent');
  v_ready := v_version.final_signed_file_path is not null and v_publication.id is not null and v_receipt.id is not null
    and v_signer_count>0 and v_delivered_count=v_signer_count;
  v_stage := case
    when v_version.final_signed_file_path is null then 'awaiting_final_artifact'
    when v_publication.id is null then 'awaiting_transaction_publication'
    when v_receipt.id is null then 'awaiting_surface_completion'
    when v_delivered_count<v_signer_count then 'awaiting_recipient_delivery'
    else 'completed_everywhere' end;
  return jsonb_build_object('contract','f5-v1','ready',v_ready,'stage',v_stage,'retryable',v_version.final_signed_file_path is not null and not v_ready,
    'packetId',v_packet.id,'versionId',v_version.id,'transactionId',v_packet.transaction_id,'finalArtifactPath',v_version.final_signed_file_path,
    'transactionDocumentId',v_publication.document_id,'completionReceiptId',v_receipt.id,'recipientCount',v_signer_count,
    'deliveredRecipientCount',v_delivered_count,'outstandingRecipientCount',greatest(v_signer_count-v_delivered_count,0),'failedRecipientCount',v_failed_count,
    'completedAt',v_receipt.completed_at);
end;
$$;

create or replace function public.bridge_claim_final_completion_retry_f5(p_packet_id uuid,p_packet_version_id uuid,p_requested_by uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_packet public.document_packets%rowtype; v_version public.document_packet_versions%rowtype; v_id uuid;
begin
  if auth.role()<>'service_role' then raise exception 'Final completion retries require the recovery service.' using errcode='42501'; end if;
  select * into v_packet from public.document_packets where id=p_packet_id;
  select * into v_version from public.document_packet_versions where id=p_packet_version_id and packet_id=p_packet_id;
  if v_packet.id is null or v_version.id is null or v_version.final_signed_file_path is null then
    raise exception 'An immutable final artifact is required before retry.' using errcode='22000',detail='F5_FINAL_ARTIFACT_REQUIRED';
  end if;
  if exists (select 1 from public.legal_final_completion_retry_attempts where packet_version_id=v_version.id and status='processing' and requested_at>now()-interval '10 minutes') then
    return null;
  end if;
  insert into public.legal_final_completion_retry_attempts(organisation_id,packet_id,packet_version_id,requested_by,status)
  values(v_packet.organisation_id,v_packet.id,v_version.id,p_requested_by,'processing') returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.bridge_complete_final_completion_retry_f5(p_attempt_id uuid,p_success boolean,p_outcome jsonb)
returns void language plpgsql security definer set search_path=public as $$
begin
  if auth.role()<>'service_role' then raise exception 'Final completion retries require the recovery service.' using errcode='42501'; end if;
  update public.legal_final_completion_retry_attempts set status=case when p_success then 'completed' else 'failed' end,
    outcome_json=coalesce(p_outcome,'{}'::jsonb),completed_at=now() where id=p_attempt_id and status='processing';
end;
$$;

revoke all on function public.bridge_get_final_completion_status_f5(uuid,uuid) from public,anon;
grant execute on function public.bridge_get_final_completion_status_f5(uuid,uuid) to authenticated,service_role;
revoke all on function public.bridge_claim_final_completion_retry_f5(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.bridge_claim_final_completion_retry_f5(uuid,uuid,uuid) to service_role;
revoke all on function public.bridge_complete_final_completion_retry_f5(uuid,boolean,jsonb) from public,anon,authenticated;
grant execute on function public.bridge_complete_final_completion_retry_f5(uuid,boolean,jsonb) to service_role;

commit;
