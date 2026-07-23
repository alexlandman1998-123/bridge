begin;

-- C4: freeze the exact saved editable revision used as render input and link
-- the resulting PDF version back to that immutable source snapshot.

alter table public.document_packet_versions
  add column if not exists render_freeze_id uuid,
  add column if not exists render_freeze_status text,
  add column if not exists render_frozen_at timestamptz,
  add column if not exists render_content_fingerprint text,
  add column if not exists render_source_version_id uuid references public.document_packet_versions(id) on delete set null,
  add column if not exists render_source_fingerprint text;

alter table public.document_packet_versions
  drop constraint if exists document_packet_versions_render_freeze_status_c4_check;
alter table public.document_packet_versions
  add constraint document_packet_versions_render_freeze_status_c4_check
  check (render_freeze_status is null or render_freeze_status in ('frozen', 'rendered', 'failed'));

create index if not exists document_packet_versions_render_source_c4_idx
  on public.document_packet_versions (render_source_version_id, created_at desc);

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
  v_version public.document_packet_versions%rowtype;
  v_latest public.document_packet_versions%rowtype;
  v_freeze_id uuid := gen_random_uuid();
  v_fingerprint text;
  v_actor uuid := auth.uid();
begin
  if auth.role() <> 'service_role' and not public.bridge_can_access_legal_packet_h2(p_packet_id) then
    raise exception 'Packet generation authority is required.' using errcode = '42501';
  end if;

  perform 1 from public.document_packets where id = p_packet_id for update;
  if not found then raise exception 'Document packet not found.' using errcode = 'P0002'; end if;

  select * into v_version
  from public.document_packet_versions
  where id = p_version_id and packet_id = p_packet_id;
  if not found then raise exception 'Editable document revision not found.' using errcode = 'P0002'; end if;

  select * into v_latest
  from public.document_packet_versions
  where packet_id = p_packet_id
  order by version_number desc
  limit 1;
  if v_latest.id is distinct from v_version.id
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
  )
  select p.id, p.organisation_id, v_version.id, 'editable_revision_frozen_for_render',
    jsonb_build_object(
      'contract', 'c4-v1',
      'freezeId', v_freeze_id,
      'sourceVersionId', v_version.id,
      'sourceVersionNumber', v_version.version_number,
      'editSequence', v_version.edit_sequence,
      'contentFingerprint', v_fingerprint
    ), v_actor
  from public.document_packets p where p.id = p_packet_id;

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
    'frozenAt', v_version.render_frozen_at
  );
end;
$$;

create or replace function public.bridge_complete_editable_render_freeze_c4(
  p_packet_id uuid,
  p_freeze_id uuid,
  p_generated_version_id uuid default null,
  p_success boolean default true,
  p_failure_message text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source public.document_packet_versions%rowtype;
  v_actor uuid := auth.uid();
begin
  if auth.role() <> 'service_role' and not public.bridge_can_access_legal_packet_h2(p_packet_id) then
    raise exception 'Packet generation authority is required.' using errcode = '42501';
  end if;

  select * into v_source
  from public.document_packet_versions
  where packet_id = p_packet_id and render_freeze_id = p_freeze_id
  for update;
  if not found then raise exception 'Render freeze not found.' using errcode = 'P0002'; end if;

  update public.document_packet_versions
  set render_freeze_status = case when p_success then 'rendered' else 'failed' end
  where id = v_source.id;

  if p_success then
    if p_generated_version_id is null then raise exception 'Generated version is required to complete a render freeze.'; end if;
    update public.document_packet_versions
    set
      render_source_version_id = v_source.id,
      render_source_fingerprint = v_source.render_content_fingerprint,
      validation_summary_json = coalesce(validation_summary_json, '{}'::jsonb) || jsonb_build_object(
        'editable_render_freeze', jsonb_build_object(
          'contract', 'c4-v1',
          'freezeId', p_freeze_id,
          'sourceVersionId', v_source.id,
          'sourceVersionNumber', v_source.version_number,
          'contentFingerprint', v_source.render_content_fingerprint,
          'frozenAt', v_source.render_frozen_at
        )
      )
    where id = p_generated_version_id and packet_id = p_packet_id;
    if not found then raise exception 'Generated packet version not found.' using errcode = 'P0002'; end if;
  end if;

  insert into public.document_packet_events (
    packet_id, organisation_id, version_id, event_type, event_payload_json, created_by
  )
  select p.id, p.organisation_id, coalesce(p_generated_version_id, v_source.id),
    case when p_success then 'editable_revision_rendered' else 'editable_revision_render_failed' end,
    jsonb_build_object(
      'contract', 'c4-v1',
      'freezeId', p_freeze_id,
      'sourceVersionId', v_source.id,
      'generatedVersionId', p_generated_version_id,
      'contentFingerprint', v_source.render_content_fingerprint,
      'failureMessage', nullif(trim(p_failure_message), '')
    ), v_actor
  from public.document_packets p where p.id = p_packet_id;

  return jsonb_build_object(
    'contract', 'c4-v1',
    'freezeId', p_freeze_id,
    'status', case when p_success then 'rendered' else 'failed' end,
    'sourceVersionId', v_source.id,
    'generatedVersionId', p_generated_version_id,
    'contentFingerprint', v_source.render_content_fingerprint
  );
end;
$$;

revoke all on function public.bridge_freeze_editable_revision_for_render_c4(uuid, uuid, integer) from public, anon;
grant execute on function public.bridge_freeze_editable_revision_for_render_c4(uuid, uuid, integer) to authenticated, service_role;
revoke all on function public.bridge_complete_editable_render_freeze_c4(uuid, uuid, uuid, boolean, text) from public, anon;
grant execute on function public.bridge_complete_editable_render_freeze_c4(uuid, uuid, uuid, boolean, text) to authenticated, service_role;

commit;
