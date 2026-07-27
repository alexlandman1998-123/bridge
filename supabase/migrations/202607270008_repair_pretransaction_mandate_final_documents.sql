-- Repair seller mandate final document rows that were made visible before
-- their canonical final-artifact metadata was written. These packets can be
-- completed before a transfer transaction exists, so transaction_id may remain
-- null while the F2 artifact/evidence binding is still valid.

update public.documents document
set
  transaction_id = packet.transaction_id,
  name = coalesce(nullif(evidence.file_name, ''), document.name),
  file_path = evidence.path,
  file_bucket = evidence.bucket,
  category = 'mandate_documents',
  document_type = 'signed_mandate',
  status = 'approved',
  visibility_scope = 'shared',
  is_client_visible = true,
  stage_key = 'final_signed',
  final_legal_packet_id = packet.id,
  final_legal_packet_version_id = version.id,
  final_artifact_bucket = evidence.bucket,
  final_artifact_media_type = evidence.media_type,
  final_artifact_byte_length = evidence.byte_length,
  final_artifact_sha256 = evidence.sha256,
  updated_at = now()
from public.document_packet_versions version
join public.document_packets packet
  on packet.id = version.packet_id
join public.legal_final_artifact_evidence evidence
  on evidence.packet_id = packet.id
 and evidence.packet_version_id = version.id
where document.id = version.final_signed_document_id
  and packet.packet_type = 'mandate'
  and packet.status = 'completed'
  and packet.current_version_number = version.version_number
  and evidence.path = version.final_signed_file_path
  and evidence.bucket = version.final_signed_file_bucket
  and document.file_path = evidence.path
  and document.file_bucket = evidence.bucket
  and (
    document.final_legal_packet_id is null
    or document.final_legal_packet_version_id is null
    or document.final_artifact_sha256 is null
    or document.status <> 'approved'
    or document.stage_key <> 'final_signed'
  );
