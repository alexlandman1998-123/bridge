begin;

-- C3: restore any editable historical revision as a new head revision. History
-- remains immutable and the same C2 optimistic-concurrency guard is enforced.

create or replace function public.bridge_restore_editable_document_revision_c3(
  p_packet_id uuid,
  p_source_version_id uuid,
  p_base_version_id uuid,
  p_expected_edit_sequence integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source public.document_packet_versions%rowtype;
  v_result jsonb;
  v_restored_version_id uuid;
  v_actor uuid := auth.uid();
begin
  if auth.role() <> 'service_role' and not public.bridge_can_access_legal_packet_h2(p_packet_id) then
    raise exception 'Packet editing authority is required.' using errcode = '42501';
  end if;

  select * into v_source
  from public.document_packet_versions
  where id = p_source_version_id
    and packet_id = p_packet_id;
  if not found then
    raise exception 'Source document revision not found.' using errcode = 'P0002';
  end if;
  if coalesce(v_source.editable_content_json, '{}'::jsonb) = '{}'::jsonb
     or jsonb_typeof(v_source.editable_content_json->'sections') <> 'array'
     or jsonb_array_length(v_source.editable_content_json->'sections') = 0 then
    raise exception 'The selected version does not contain restorable editable content.';
  end if;

  select public.bridge_save_editable_document_revision_c2(
    p_packet_id => p_packet_id,
    p_base_version_id => p_base_version_id,
    p_expected_edit_sequence => p_expected_edit_sequence,
    p_editable_content_json => v_source.editable_content_json || jsonb_build_object(
      'restoredFromVersionId', v_source.id,
      'restoredAt', now()
    ),
    p_section_manifest_json => v_source.section_manifest_json,
    p_placeholders_json => v_source.placeholders_resolved_json,
    p_validation_summary_json => coalesce(v_source.validation_summary_json, '{}'::jsonb) || jsonb_build_object(
      'contract', 'c3-v1',
      'restoredFromVersionId', v_source.id,
      'restoredFromVersionNumber', v_source.version_number
    ),
    p_review_state => 'draft'
  ) into v_result;

  if v_result->>'contract' <> 'c2-v1' then
    raise exception 'Editable revision restore returned an invalid result.';
  end if;
  v_restored_version_id := (v_result#>>'{version,id}')::uuid;

  insert into public.document_packet_events (
    packet_id, organisation_id, version_id, event_type, event_payload_json, created_by
  )
  select
    p.id, p.organisation_id, v_restored_version_id, 'editable_revision_restored',
    jsonb_build_object(
      'contract', 'c3-v1',
      'sourceVersionId', v_source.id,
      'sourceVersionNumber', v_source.version_number,
      'restoredVersionId', v_restored_version_id,
      'restoredVersionNumber', v_result#>>'{version,version_number}'
    ),
    v_actor
  from public.document_packets p
  where p.id = p_packet_id;

  return jsonb_set(v_result, '{contract}', to_jsonb('c3-v1'::text), true);
end;
$$;

revoke all on function public.bridge_restore_editable_document_revision_c3(uuid, uuid, uuid, integer) from public, anon;
grant execute on function public.bridge_restore_editable_document_revision_c3(uuid, uuid, uuid, integer) to authenticated, service_role;

commit;
