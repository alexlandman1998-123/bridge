begin;

-- Phase 1 final-mile corrective migration.
-- The final completion status must never report completed_everywhere while
-- recipient delivery is still pending. Older staging code exposed both
-- ready=true and deliveryReady=false in one response, which created a false
-- green workspace state and hid the retry path.

create or replace function public.bridge_get_final_completion_status_f5(
  p_packet_id uuid,
  p_packet_version_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_packet public.document_packets%rowtype;
  v_version public.document_packet_versions%rowtype;
  v_publication public.legal_final_transaction_publications%rowtype;
  v_receipt public.legal_final_completion_receipts%rowtype;
  v_signer_count integer := 0;
  v_delivered_count integer := 0;
  v_failed_count integer := 0;
  v_artifact_ready boolean := false;
  v_transaction_ready boolean := false;
  v_surface_ready boolean := false;
  v_delivery_ready boolean := false;
  v_ready boolean := false;
  v_stage text := 'awaiting_final_artifact';
  v_delivery_stage text := 'recipient_delivery_pending';
begin
  if auth.role() <> 'service_role' and not public.bridge_can_access_legal_packet_h2(p_packet_id) then
    raise exception 'Final completion status is unavailable.' using errcode = '42501';
  end if;

  select * into v_packet
  from public.document_packets
  where id = p_packet_id;

  select * into v_version
  from public.document_packet_versions
  where id = p_packet_version_id
    and packet_id = p_packet_id;

  if v_packet.id is null or v_version.id is null then
    raise exception 'Packet completion target was not found.' using errcode = 'P0002';
  end if;

  select * into v_publication
  from public.legal_final_transaction_publications
  where packet_version_id = v_version.id;

  select * into v_receipt
  from public.legal_final_completion_receipts
  where packet_version_id = v_version.id;

  select count(*) into v_signer_count
  from public.document_packet_signers
  where packet_version_id = v_version.id;

  select count(*) into v_delivered_count
  from public.document_packet_signers signer
  where signer.packet_version_id = v_version.id
    and exists (
      select 1
      from public.legal_final_artifact_deliveries delivery
      where delivery.packet_version_id = v_version.id
        and delivery.signer_id = signer.id
        and delivery.status = 'sent'
        and coalesce(delivery.provider_message_id, '') <> ''
    );

  select count(*) into v_failed_count
  from public.document_packet_signers signer
  where signer.packet_version_id = v_version.id
    and not exists (
      select 1
      from public.legal_final_artifact_deliveries delivery
      where delivery.packet_version_id = v_version.id
        and delivery.signer_id = signer.id
        and delivery.status = 'sent'
        and coalesce(delivery.provider_message_id, '') <> ''
    );

  v_artifact_ready := coalesce(v_version.final_signed_file_path, '') <> '';
  v_transaction_ready := v_publication.id is not null
    and coalesce(v_publication.document_id::text, '') <> '';
  v_surface_ready := v_receipt.id is not null
    and coalesce(v_receipt.transaction_visible, false) is true
    and coalesce(v_receipt.client_visible, false) is true
    and coalesce(v_receipt.canonical_satisfied, false) is true;
  v_delivery_ready := v_signer_count > 0
    and v_delivered_count = v_signer_count;
  v_ready := v_artifact_ready
    and v_transaction_ready
    and v_surface_ready
    and v_delivery_ready;

  v_delivery_stage := case
    when v_signer_count = 0 then 'recipient_delivery_missing'
    when v_delivery_ready then 'recipient_delivery_complete'
    when v_delivered_count > 0 then 'recipient_delivery_partial'
    else 'recipient_delivery_pending'
  end;

  v_stage := case
    when not v_artifact_ready then 'awaiting_final_artifact'
    when not v_transaction_ready then 'awaiting_transaction_publication'
    when not v_surface_ready then 'awaiting_surface_completion'
    when not v_delivery_ready then 'awaiting_recipient_delivery'
    else 'completed_everywhere'
  end;

  return jsonb_build_object(
    'contract', 'f5-v1',
    'ready', v_ready,
    'stage', v_stage,
    'retryable', v_artifact_ready and not v_ready,
    'packetId', v_packet.id,
    'versionId', v_version.id,
    'transactionId', v_packet.transaction_id,
    'finalArtifactPath', v_version.final_signed_file_path,
    'transactionDocumentId', v_publication.document_id,
    'completionReceiptId', v_receipt.id,
    'recipientCount', v_signer_count,
    'deliveredRecipientCount', v_delivered_count,
    'outstandingRecipientCount', greatest(v_signer_count - v_delivered_count, 0),
    'failedRecipientCount', v_failed_count,
    'artifactReady', v_artifact_ready,
    'transactionReady', v_transaction_ready,
    'surfaceReady', v_surface_ready,
    'deliveryReady', v_delivery_ready,
    'deliveryStage', v_delivery_stage,
    'deliveryRetryable', v_artifact_ready and not v_delivery_ready,
    'completedAt', case when v_ready then v_receipt.completed_at else null end
  );
end;
$$;

revoke all on function public.bridge_get_final_completion_status_f5(uuid, uuid) from public, anon;
grant execute on function public.bridge_get_final_completion_status_f5(uuid, uuid) to authenticated, service_role;

commit;
