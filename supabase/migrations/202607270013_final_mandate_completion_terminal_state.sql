begin;

create or replace function public.bridge_mark_final_completion_packet_terminal()
returns trigger
language plpgsql
security definer
set search_path = public
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

revoke all on function public.bridge_mark_final_completion_packet_terminal() from public, anon, authenticated;

commit;
