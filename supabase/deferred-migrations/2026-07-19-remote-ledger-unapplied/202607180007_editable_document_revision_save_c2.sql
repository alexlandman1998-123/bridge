begin;

-- C2: save transaction-specific document edits as immutable revisions with
-- optimistic concurrency. A stale browser must never overwrite a newer edit.

create or replace function public.bridge_save_editable_document_revision_c2(
  p_packet_id uuid,
  p_base_version_id uuid,
  p_expected_edit_sequence integer,
  p_editable_content_json jsonb,
  p_section_manifest_json jsonb,
  p_placeholders_json jsonb default '{}'::jsonb,
  p_validation_summary_json jsonb default '{}'::jsonb,
  p_review_state text default 'draft'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_packet public.document_packets%rowtype;
  v_base public.document_packet_versions%rowtype;
  v_latest public.document_packet_versions%rowtype;
  v_version public.document_packet_versions%rowtype;
  v_version_result jsonb;
  v_next_sequence integer;
  v_review_state text := lower(coalesce(nullif(trim(p_review_state), ''), 'draft'));
begin
  if auth.role() <> 'service_role' and v_actor is null then
    raise exception 'Authenticated document author is required.' using errcode = '42501';
  end if;
  if auth.role() <> 'service_role' and not public.bridge_can_access_legal_packet_h2(p_packet_id) then
    raise exception 'Packet editing authority is required.' using errcode = '42501';
  end if;
  if v_review_state not in ('draft', 'in_review') then
    raise exception 'Review state must be draft or in_review.';
  end if;
  if coalesce(p_editable_content_json, '{}'::jsonb) = '{}'::jsonb
     or jsonb_typeof(p_editable_content_json->'sections') <> 'array'
     or jsonb_array_length(p_editable_content_json->'sections') = 0 then
    raise exception 'Editable document content must contain at least one section.';
  end if;
  if jsonb_typeof(p_section_manifest_json) <> 'array'
     or jsonb_array_length(p_section_manifest_json) = 0 then
    raise exception 'Editable section manifest must contain at least one section.';
  end if;

  select * into v_packet
  from public.document_packets
  where id = p_packet_id
  for update;
  if not found then
    raise exception 'Document packet not found.' using errcode = 'P0002';
  end if;
  if v_packet.status in ('sent', 'partially_signed', 'completed', 'voided', 'archived') then
    raise exception 'This document is locked and can no longer be edited.' using errcode = '55000';
  end if;

  select * into v_base
  from public.document_packet_versions
  where id = p_base_version_id
    and packet_id = p_packet_id;
  if not found then
    raise exception 'Base document revision not found.' using errcode = 'P0002';
  end if;

  select * into v_latest
  from public.document_packet_versions
  where packet_id = p_packet_id
  order by version_number desc
  limit 1;

  if v_latest.id is distinct from v_base.id then
    raise exception 'A newer document revision already exists. Reload before saving.'
      using errcode = '40001', detail = 'STALE_EDITABLE_DOCUMENT_REVISION';
  end if;
  if coalesce(v_base.edit_sequence, 0) <> coalesce(p_expected_edit_sequence, 0) then
    raise exception 'This document was changed in another session. Reload before saving.'
      using errcode = '40001', detail = 'STALE_EDITABLE_DOCUMENT_REVISION';
  end if;
  if v_base.edit_status = 'locked' then
    raise exception 'This document revision is locked.' using errcode = '55000';
  end if;

  v_next_sequence := coalesce(v_base.edit_sequence, 0) + 1;

  select public.bridge_create_document_packet_version_i1(
    p_packet_id => v_packet.id,
    p_render_status => 'draft',
    p_placeholders_resolved_json => coalesce(p_placeholders_json, v_base.placeholders_resolved_json, '{}'::jsonb),
    p_placeholders_missing_json => coalesce(v_base.placeholders_missing_json, '[]'::jsonb),
    p_section_manifest_json => p_section_manifest_json,
    p_validation_summary_json => coalesce(p_validation_summary_json, '{}'::jsonb) || jsonb_build_object(
      'contract', 'c2-v1',
      'editableDraft', true,
      'review_state', v_review_state,
      'baseVersionId', v_base.id,
      'editSequence', v_next_sequence,
      'generationStatus', 'not_generated'
    ),
    p_generated_by => v_actor,
    p_generated_at => now(),
    p_dry_run => false
  ) into v_version_result;

  update public.document_packet_versions
  set
    source_template_revision_id = coalesce(v_base.source_template_revision_id, v_packet.template_revision_id, v_packet.template_id),
    editable_content_schema_version = coalesce((p_editable_content_json->>'schemaVersion')::integer, 1),
    editable_content_json = jsonb_set(
      jsonb_set(p_editable_content_json, '{documentId}', to_jsonb(v_packet.id), true),
      '{reviewState}', to_jsonb(v_review_state), true
    ),
    edit_status = 'draft',
    edit_sequence = v_next_sequence
  where id = (v_version_result#>>'{version,id}')::uuid
  returning * into v_version;

  if v_version.id is null then
    raise exception 'Edited document revision was not persisted.';
  end if;

  update public.document_packet_versions
  set edit_status = 'superseded'
  where id = v_base.id
    and edit_status = 'draft';

  update public.document_packets
  set
    status = 'draft',
    source_context_json = coalesce(source_context_json, '{}'::jsonb) || jsonb_build_object(
      'editableDraftLastSavedAt', now(),
      'editableDraftReviewState', v_review_state,
      'editableDraftVersion', v_version.version_number,
      'editableDraftEditSequence', v_next_sequence
    )
  where id = v_packet.id
  returning * into v_packet;

  insert into public.document_packet_events (
    packet_id, organisation_id, version_id, event_type, event_payload_json, created_by
  ) values (
    v_packet.id, v_packet.organisation_id, v_version.id,
    case when v_review_state = 'in_review' then 'draft_marked_in_review' else 'draft_edited' end,
    jsonb_build_object(
      'contract', 'c2-v1',
      'baseVersionId', v_base.id,
      'versionNumber', v_version.version_number,
      'editSequence', v_next_sequence,
      'sectionCount', jsonb_array_length(p_editable_content_json->'sections')
    ),
    v_actor
  );

  return jsonb_build_object(
    'contract', 'c2-v1',
    'packet', to_jsonb(v_packet),
    'version', to_jsonb(v_version),
    'editableContent', v_version.editable_content_json
  );
end;
$$;

revoke all on function public.bridge_save_editable_document_revision_c2(
  uuid, uuid, integer, jsonb, jsonb, jsonb, jsonb, text
) from public, anon;
grant execute on function public.bridge_save_editable_document_revision_c2(
  uuid, uuid, integer, jsonb, jsonb, jsonb, jsonb, text
) to authenticated, service_role;

commit;
