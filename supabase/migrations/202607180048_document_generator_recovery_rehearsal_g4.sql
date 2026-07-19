begin;

create or replace function public.bridge_rehearse_final_completion_recovery_g4(
  p_packet_id uuid,
  p_packet_version_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_packet public.document_packets%rowtype;
  v_version public.document_packet_versions%rowtype;
  v_evidence public.legal_final_artifact_evidence%rowtype;
  v_publication public.legal_final_transaction_publications%rowtype;
  v_receipt public.legal_final_completion_receipts%rowtype;
  v_signers integer:=0;
  v_delivered integer:=0;
  v_evidence_count integer:=0;
  v_publication_count integer:=0;
  v_receipt_count integer:=0;
  v_active_delivery_claims integer:=0;
  v_active_completion_retries integer:=0;
  v_artifact_valid boolean:=false;
  v_publication_valid boolean:=false;
  v_receipt_valid boolean:=false;
begin
  if auth.role()<>'service_role' and not public.bridge_can_access_legal_packet_h2(p_packet_id) then
    raise exception 'Recovery rehearsal evidence is unavailable.' using errcode='42501';
  end if;
  select * into v_packet from public.document_packets where id=p_packet_id;
  select * into v_version from public.document_packet_versions where id=p_packet_version_id and packet_id=p_packet_id;
  if v_packet.id is null or v_version.id is null then raise exception 'Recovery rehearsal target was not found.' using errcode='P0002'; end if;
  if lower(coalesce(v_packet.packet_type,'')) not in ('otp','mandate') then raise exception 'Recovery rehearsal requires an OTP or mandate.' using errcode='22000'; end if;

  select * into v_evidence from public.legal_final_artifact_evidence where packet_version_id=v_version.id;
  select * into v_publication from public.legal_final_transaction_publications where packet_version_id=v_version.id;
  select * into v_receipt from public.legal_final_completion_receipts where packet_version_id=v_version.id;
  select count(*) into v_evidence_count from public.legal_final_artifact_evidence where packet_version_id=v_version.id;
  select count(*) into v_publication_count from public.legal_final_transaction_publications where packet_version_id=v_version.id;
  select count(*) into v_receipt_count from public.legal_final_completion_receipts where packet_version_id=v_version.id;
  select count(*) into v_signers from public.document_packet_signers where packet_version_id=v_version.id;
  select count(*) into v_delivered from public.document_packet_signers signer where signer.packet_version_id=v_version.id and exists(
    select 1 from public.legal_final_artifact_deliveries delivery where delivery.packet_version_id=v_version.id
      and delivery.signer_id=signer.id and delivery.status='sent' and coalesce(delivery.provider_message_id,'')<>''
      and delivery.artifact_sha256=v_evidence.sha256 and delivery.artifact_path=v_evidence.path
  );
  select count(*) into v_active_delivery_claims from public.legal_final_delivery_claims
    where packet_version_id=v_version.id and status='processing' and claimed_at>now()-interval '10 minutes';
  select count(*) into v_active_completion_retries from public.legal_final_completion_retry_attempts
    where packet_version_id=v_version.id and status='processing' and requested_at>now()-interval '10 minutes';

  v_artifact_valid := v_evidence.id is not null and v_evidence_count=1
    and v_evidence.path=v_version.final_signed_file_path and v_evidence.bucket=v_version.final_signed_file_bucket
    and v_evidence.sha256~'^[0-9a-f]{64}$' and v_evidence.byte_length>=100;
  v_publication_valid := v_publication.id is not null and v_publication_count=1 and v_artifact_valid
    and v_publication.transaction_id=v_packet.transaction_id and v_publication.artifact_sha256=v_evidence.sha256
    and v_publication.artifact_path=v_evidence.path and v_publication.document_id=v_version.final_signed_document_id;
  v_receipt_valid := v_receipt.id is not null and v_receipt_count=1 and v_publication_valid
    and v_receipt.transaction_id=v_publication.transaction_id and v_receipt.document_id=v_publication.document_id
    and v_receipt.artifact_sha256=v_publication.artifact_sha256 and v_receipt.transaction_visible
    and v_receipt.client_visible and v_receipt.canonical_satisfied;

  return jsonb_build_object(
    'contract','g4-v1','packetId',v_packet.id,'versionId',v_version.id,'packetType',lower(v_packet.packet_type),
    'currentVersion',v_packet.current_version_number=v_version.version_number,'packetStatus',v_packet.status,
    'immutableArtifact',jsonb_build_object('valid',v_artifact_valid,'evidenceCount',v_evidence_count,'bucket',v_evidence.bucket,
      'path',v_evidence.path,'sha256',v_evidence.sha256,'byteLength',v_evidence.byte_length),
    'transactionPublication',jsonb_build_object('valid',v_publication_valid,'count',v_publication_count,'id',v_publication.id,
      'transactionId',v_publication.transaction_id,'documentId',v_publication.document_id),
    'surfaceCompletion',jsonb_build_object('valid',v_receipt_valid,'count',v_receipt_count,'id',v_receipt.id,
      'transactionVisible',v_receipt.transaction_visible,'clientVisible',v_receipt.client_visible,'canonicalSatisfied',v_receipt.canonical_satisfied),
    'actualState',jsonb_build_object('recipientCount',v_signers,'deliveredRecipientCount',v_delivered,
      'outstandingRecipientCount',greatest(v_signers-v_delivered,0),'activeDeliveryClaimCount',v_active_delivery_claims,
      'activeCompletionRetryCount',v_active_completion_retries),
    'simulatedRecipientFailure',jsonb_build_object('applied',v_signers>0,'recipientCount',v_signers,
      'wouldSkipDeliveredRecipientCount',greatest(v_signers-1,0),'wouldClaimRecipientCount',case when v_signers>0 then 1 else 0 end,
      'wouldReuseArtifact',v_artifact_valid,'wouldReusePublication',v_publication_valid,'wouldReuseCompletionReceipt',v_receipt_valid,
      'providerIdempotencyKeyStable',v_signers>0,'signedArtifactMutationCount',0),
    'safeToExecute',v_artifact_valid and v_publication_valid and v_receipt_valid and v_signers>0
      and v_active_delivery_claims=0 and v_active_completion_retries=0,
    'mutatedData',false,'checkedAt',now()
  );
end;
$$;

revoke all on function public.bridge_rehearse_final_completion_recovery_g4(uuid,uuid) from public,anon;
grant execute on function public.bridge_rehearse_final_completion_recovery_g4(uuid,uuid) to authenticated,service_role;

commit;
