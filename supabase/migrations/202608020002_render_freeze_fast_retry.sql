begin;

create index if not exists document_packet_versions_packet_latest_freeze_idx
  on public.document_packet_versions (packet_id, version_number desc, id);

create or replace function public.bridge_freeze_editable_revision_for_render_c4(
  p_packet_id uuid,
  p_version_id uuid,
  p_expected_edit_sequence integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_packet public.document_packets%rowtype;
  v_version public.document_packet_versions%rowtype;
  v_latest_id uuid;
  v_freeze_id uuid := gen_random_uuid();
  v_fingerprint text;
  v_actor uuid := auth.uid();
begin
  perform set_config('lock_timeout', '5000', true);

  if auth.role() <> 'service_role' and not public.bridge_can_access_legal_packet_h2(p_packet_id) then
    raise exception 'Packet generation authority is required.' using errcode = '42501';
  end if;

  select * into v_packet
  from public.document_packets
  where id = p_packet_id;
  if not found then raise exception 'Document packet not found.' using errcode = 'P0002'; end if;
  if v_packet.status in ('sent', 'partially_signed', 'completed', 'voided', 'archived') then
    raise exception 'This document is locked and can no longer be generated.' using errcode = '55000';
  end if;

  select * into v_version
  from public.document_packet_versions
  where id = p_version_id and packet_id = p_packet_id;
  if not found then raise exception 'Editable document revision not found.' using errcode = 'P0002'; end if;

  select id into v_latest_id
  from public.document_packet_versions
  where packet_id = p_packet_id
  order by version_number desc
  limit 1;
  if v_latest_id is distinct from v_version.id
     or coalesce(v_version.edit_sequence, 0) <> coalesce(p_expected_edit_sequence, 0) then
    raise exception 'A newer editable revision exists. Reload before generating.'
      using errcode = '40001', detail = 'STALE_EDITABLE_DOCUMENT_REVISION';
  end if;
  if coalesce(v_version.editable_content_json, '{}'::jsonb) = '{}'::jsonb
     or jsonb_typeof(v_version.editable_content_json->'sections') <> 'array'
     or jsonb_array_length(v_version.editable_content_json->'sections') = 0 then
    raise exception 'The selected revision has no editable content to render.';
  end if;

  v_fingerprint := 'md5_' || md5(
    v_version.editable_content_json::text || '|' ||
    coalesce(v_version.section_manifest_json, '[]'::jsonb)::text || '|' ||
    coalesce(v_version.placeholders_resolved_json, '{}'::jsonb)::text
  );

  if lower(coalesce(v_version.render_freeze_status, '')) = 'frozen'
     and nullif(trim(coalesce(v_version.render_freeze_id::text, '')), '') is not null
     and coalesce(v_version.render_content_fingerprint, '') = v_fingerprint then
    return jsonb_build_object(
      'contract', 'c4-v1',
      'packetId', p_packet_id,
      'freezeId', v_version.render_freeze_id,
      'sourceVersionId', v_version.id,
      'sourceVersionNumber', v_version.version_number,
      'editSequence', v_version.edit_sequence,
      'contentFingerprint', v_version.render_content_fingerprint,
      'editableContent', v_version.editable_content_json,
      'sectionManifest', v_version.section_manifest_json,
      'placeholders', v_version.placeholders_resolved_json,
      'frozenAt', v_version.render_frozen_at,
      'reused', true
    );
  end if;

  select * into v_packet
  from public.document_packets
  where id = p_packet_id
  for update;
  if v_packet.status in ('sent', 'partially_signed', 'completed', 'voided', 'archived') then
    raise exception 'This document is locked and can no longer be generated.' using errcode = '55000';
  end if;

  select id into v_latest_id
  from public.document_packet_versions
  where packet_id = p_packet_id
  order by version_number desc
  limit 1;
  if v_latest_id is distinct from v_version.id then
    raise exception 'A newer editable revision exists. Reload before generating.'
      using errcode = '40001', detail = 'STALE_EDITABLE_DOCUMENT_REVISION';
  end if;

  update public.document_packet_versions
  set
    render_freeze_id = v_freeze_id,
    render_freeze_status = 'frozen',
    render_frozen_at = now(),
    render_content_fingerprint = v_fingerprint
  where id = v_version.id
  returning * into v_version;

  insert into public.document_packet_events (
    packet_id, organisation_id, version_id, event_type, event_payload_json, created_by
  ) values (
    v_packet.id, v_packet.organisation_id, v_version.id, 'editable_revision_frozen_for_render',
    jsonb_build_object(
      'contract', 'c4-v1',
      'freezeId', v_freeze_id,
      'sourceVersionId', v_version.id,
      'sourceVersionNumber', v_version.version_number,
      'editSequence', v_version.edit_sequence,
      'contentFingerprint', v_fingerprint
    ), v_actor
  );

  return jsonb_build_object(
    'contract', 'c4-v1',
    'packetId', p_packet_id,
    'freezeId', v_freeze_id,
    'sourceVersionId', v_version.id,
    'sourceVersionNumber', v_version.version_number,
    'editSequence', v_version.edit_sequence,
    'contentFingerprint', v_fingerprint,
    'editableContent', v_version.editable_content_json,
    'sectionManifest', v_version.section_manifest_json,
    'placeholders', v_version.placeholders_resolved_json,
    'frozenAt', v_version.render_frozen_at,
    'reused', false
  );
exception
  when lock_not_available then
    raise exception 'Editable render freeze is busy. Retry shortly.'
      using errcode = '55P03', detail = 'LEGAL_DOCUMENT_RENDER_FREEZE_LOCK_BUSY';
end;
$$;

revoke all on function public.bridge_freeze_editable_revision_for_render_c4(uuid, uuid, integer) from public, anon;
grant execute on function public.bridge_freeze_editable_revision_for_render_c4(uuid, uuid, integer) to authenticated, service_role;

commit;
