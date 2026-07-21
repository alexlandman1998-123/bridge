begin;

create or replace function public.bridge_mark_final_completion_packet_terminal()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  v_now timestamptz := now();
begin
  update public.document_packets
  set
    status = 'completed',
    completed_at = coalesce(completed_at, new.completed_at, v_now),
    source_context_json =
      coalesce(source_context_json, '{}'::jsonb) ||
      jsonb_build_object(
        'signing_status', 'completed',
        'signingStatus', 'completed',
        'mandateStatus', 'completed',
        'finalSignedAt', coalesce(new.completed_at, v_now),
        'completedAt', coalesce(new.completed_at, v_now),
        'finalCompletionReceiptId', new.id,
        'finalCompletionDocumentId', new.document_id,
        'finalCompletionPublicationId', new.publication_id,
        'finalCompletionArtifactSha256', new.artifact_sha256,
        'lifecycle_state', 'completed',
        'lifecycle_previous_state', coalesce(source_context_json->>'lifecycle_state', status),
        'lifecycle_updated_at', v_now
      ),
    updated_at = v_now
  where id = new.packet_id;

  return new;
end;
$$;

drop trigger if exists trg_mark_final_completion_packet_terminal on public.legal_final_completion_receipts;
create trigger trg_mark_final_completion_packet_terminal
after insert on public.legal_final_completion_receipts
for each row execute function public.bridge_mark_final_completion_packet_terminal();

update public.document_packets packet
set
  status = 'completed',
  completed_at = coalesce(packet.completed_at, receipt.completed_at, now()),
  source_context_json =
    coalesce(packet.source_context_json, '{}'::jsonb) ||
    jsonb_build_object(
      'signing_status', 'completed',
      'signingStatus', 'completed',
      'mandateStatus', 'completed',
      'finalSignedAt', coalesce(receipt.completed_at, packet.completed_at, now()),
      'completedAt', coalesce(receipt.completed_at, packet.completed_at, now()),
      'finalCompletionReceiptId', receipt.id,
      'finalCompletionDocumentId', receipt.document_id,
      'finalCompletionPublicationId', receipt.publication_id,
      'finalCompletionArtifactSha256', receipt.artifact_sha256,
      'lifecycle_state', 'completed',
      'lifecycle_previous_state', coalesce(packet.source_context_json->>'lifecycle_state', packet.status),
      'lifecycle_updated_at', now()
    ),
  updated_at = now()
from public.legal_final_completion_receipts receipt
join public.document_packet_versions version on version.id = receipt.packet_version_id
where packet.id = receipt.packet_id
  and version.final_signed_file_path is not null
  and receipt.transaction_visible is true
  and receipt.client_visible is true
  and receipt.canonical_satisfied is true
  and (
    packet.status is distinct from 'completed'
    or coalesce(packet.source_context_json->>'signing_status', '') is distinct from 'completed'
    or coalesce(packet.source_context_json->>'signingStatus', '') is distinct from 'completed'
    or coalesce(packet.source_context_json->>'mandateStatus', '') is distinct from 'completed'
  );

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
  v_delivery_ready boolean;
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

  v_ready := v_version.final_signed_file_path is not null
    and v_publication.id is not null
    and v_receipt.id is not null
    and coalesce(v_receipt.transaction_visible,false) is true
    and coalesce(v_receipt.client_visible,false) is true
    and coalesce(v_receipt.canonical_satisfied,false) is true;
  v_delivery_ready := v_signer_count = 0 or v_delivered_count = v_signer_count;
  v_stage := case
    when v_version.final_signed_file_path is null then 'awaiting_final_artifact'
    when v_publication.id is null then 'awaiting_transaction_publication'
    when v_receipt.id is null then 'awaiting_surface_completion'
    when v_ready then 'completed_everywhere'
    else 'awaiting_surface_completion' end;

  return jsonb_build_object(
    'contract','f5-v1',
    'ready',v_ready,
    'stage',v_stage,
    'retryable',v_version.final_signed_file_path is not null and not v_ready,
    'deliveryReady',v_delivery_ready,
    'deliveryStage',case when v_delivery_ready then 'delivered_or_not_required' else 'recipient_delivery_pending' end,
    'deliveryRetryable',v_ready and not v_delivery_ready,
    'packetId',v_packet.id,
    'versionId',v_version.id,
    'transactionId',v_packet.transaction_id,
    'finalArtifactPath',v_version.final_signed_file_path,
    'transactionDocumentId',v_publication.document_id,
    'completionReceiptId',v_receipt.id,
    'recipientCount',v_signer_count,
    'deliveredRecipientCount',v_delivered_count,
    'outstandingRecipientCount',greatest(v_signer_count-v_delivered_count,0),
    'failedRecipientCount',v_failed_count,
    'completedAt',v_receipt.completed_at
  );
end;
$$;

revoke all on function public.bridge_mark_final_completion_packet_terminal() from public,anon,authenticated;
revoke all on function public.bridge_get_final_completion_status_f5(uuid,uuid) from public,anon;
grant execute on function public.bridge_get_final_completion_status_f5(uuid,uuid) to authenticated,service_role;

commit;
