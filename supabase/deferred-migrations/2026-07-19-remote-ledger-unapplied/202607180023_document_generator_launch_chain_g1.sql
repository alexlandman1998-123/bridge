begin;

create or replace function public.bridge_get_document_generator_launch_chain_g1(p_packet_id uuid,p_packet_version_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_packet public.document_packets%rowtype;
  v_version public.document_packet_versions%rowtype;
  v_layout public.document_signing_field_layouts%rowtype;
  v_evidence public.legal_final_artifact_evidence%rowtype;
  v_transaction_publication public.legal_final_transaction_publications%rowtype;
  v_receipt public.legal_final_completion_receipts%rowtype;
  v_signers integer:=0; v_signed integer:=0; v_sessions integer:=0; v_delivered integer:=0; v_fields integer:=0; v_completed_fields integer:=0;
  v_dispatch_delivered boolean:=false;
begin
  if auth.role()<>'service_role' and not public.bridge_can_access_legal_packet_h2(p_packet_id) then
    raise exception 'Generator launch evidence is unavailable.' using errcode='42501';
  end if;
  select * into v_packet from public.document_packets where id=p_packet_id;
  select * into v_version from public.document_packet_versions where id=p_packet_version_id and packet_id=p_packet_id;
  if v_packet.id is null or v_version.id is null then raise exception 'Generator launch target was not found.' using errcode='P0002'; end if;
  select * into v_layout from public.document_signing_field_layouts where packet_version_id=v_version.id limit 1;
  select * into v_evidence from public.legal_final_artifact_evidence where packet_version_id=v_version.id;
  select * into v_transaction_publication from public.legal_final_transaction_publications where packet_version_id=v_version.id;
  select * into v_receipt from public.legal_final_completion_receipts where packet_version_id=v_version.id;
  select count(*),count(*) filter(where status='signed') into v_signers,v_signed from public.document_packet_signers where packet_version_id=v_version.id;
  select count(*) into v_sessions from public.document_signer_sessions where packet_version_id=v_version.id and status='completed';
  select count(*),count(*) filter(where status='completed') into v_fields,v_completed_fields from public.document_signing_fields where packet_version_id=v_version.id and required is true;
  select exists(select 1 from public.document_signing_dispatches where packet_version_id=v_version.id and status='delivered') into v_dispatch_delivered;
  select count(*) into v_delivered from public.document_packet_signers signer where signer.packet_version_id=v_version.id and exists(
    select 1 from public.legal_final_artifact_deliveries delivery where delivery.packet_version_id=v_version.id and delivery.signer_id=signer.id and delivery.status='sent'
  );
  return jsonb_build_object(
    'contract','g1-v1','packetId',v_packet.id,'versionId',v_version.id,'packetType',v_packet.packet_type,
    'currentVersion',v_packet.current_version_number=v_version.version_number,'packetStatus',v_packet.status,
    'editableDraft',jsonb_build_object('present',jsonb_typeof(v_version.editable_content_json)='object','status',v_version.edit_status,'sequence',v_version.edit_sequence),
    'renderFreeze',jsonb_build_object('verified',coalesce(v_version.render_input_verified,false),'freezeId',v_version.render_freeze_id,'fingerprint',v_version.render_content_fingerprint),
    'certifiedPdf',jsonb_build_object('nativeVerified',coalesce(v_version.native_pdf_verified,false),'transactionPersisted',coalesce(v_version.transaction_pdf_persisted,false),'path',v_version.rendered_file_path,'sha256',v_version.rendered_sha256),
    'layout',jsonb_build_object('id',v_layout.id,'status',v_layout.status,'placementVerified',coalesce(v_layout.placement_verified,false),'fieldCount',coalesce(v_layout.applied_field_count,0)),
    'dispatch',jsonb_build_object('delivered',v_dispatch_delivered),
    'signing',jsonb_build_object('signerCount',v_signers,'signedCount',v_signed,'completedSessionCount',v_sessions,'requiredFieldCount',v_fields,'completedRequiredFieldCount',v_completed_fields),
    'finalArtifact',jsonb_build_object('path',v_version.final_signed_file_path,'sha256',v_evidence.sha256,'byteLength',v_evidence.byte_length),
    'transactionPublication',jsonb_build_object('id',v_transaction_publication.id,'transactionId',v_transaction_publication.transaction_id,'documentId',v_transaction_publication.document_id,'sha256',v_transaction_publication.artifact_sha256),
    'surfaceCompletion',jsonb_build_object('id',v_receipt.id,'transactionVisible',v_receipt.transaction_visible,'clientVisible',v_receipt.client_visible,'canonicalSatisfied',v_receipt.canonical_satisfied),
    'delivery',jsonb_build_object('recipientCount',v_signers,'deliveredRecipientCount',v_delivered),
    'checkedAt',now()
  );
end;
$$;

revoke all on function public.bridge_get_document_generator_launch_chain_g1(uuid,uuid) from public,anon;
grant execute on function public.bridge_get_document_generator_launch_chain_g1(uuid,uuid) to authenticated,service_role;

commit;
