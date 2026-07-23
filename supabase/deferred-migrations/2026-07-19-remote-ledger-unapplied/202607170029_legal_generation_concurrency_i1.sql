begin;

create unique index if not exists document_packet_versions_packet_version_i1_uq
  on public.document_packet_versions (packet_id, version_number);

-- New versions must be created by the atomic RPC. Existing update permissions
-- remain available for the governed review/signing lifecycle.
revoke insert on table public.document_packet_versions from authenticated;

create or replace function public.bridge_create_document_packet_version_i1(
  p_packet_id uuid,
  p_render_status text,
  p_rendered_document_id uuid default null,
  p_rendered_file_path text default null,
  p_rendered_file_name text default null,
  p_rendered_file_url text default null,
  p_placeholders_resolved_json jsonb default '{}'::jsonb,
  p_placeholders_missing_json jsonb default '[]'::jsonb,
  p_section_manifest_json jsonb default '[]'::jsonb,
  p_validation_summary_json jsonb default '{}'::jsonb,
  p_generated_by uuid default null,
  p_generated_at timestamptz default now(),
  p_dry_run boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_packet public.document_packets%rowtype;
  v_version public.document_packet_versions%rowtype;
  v_next_version integer;
  v_actor uuid := auth.uid();
begin
  if auth.role() <> 'service_role' and not public.bridge_can_access_legal_packet_h2(p_packet_id) then
    raise exception 'Packet version authority is required.' using errcode = '42501';
  end if;

  select * into v_packet
  from public.document_packets
  where id = p_packet_id
  for update;

  if v_packet.id is null then
    raise exception 'Document packet not found.' using errcode = 'P0002';
  end if;

  select coalesce(max(version_number), 0) + 1 into v_next_version
  from public.document_packet_versions
  where packet_id = p_packet_id;

  if p_dry_run then
    return jsonb_build_object(
      'contract', 'i1-v1',
      'dryRun', true,
      'packetId', p_packet_id,
      'nextVersionNumber', v_next_version
    );
  end if;

  if auth.role() <> 'service_role' and v_actor is null then
    raise exception 'Authenticated generation actor is required.' using errcode = '42501';
  end if;

  insert into public.document_packet_versions (
    packet_id, organisation_id, version_number, render_status,
    rendered_document_id, rendered_file_path, rendered_file_name, rendered_file_url,
    placeholders_resolved_json, placeholders_missing_json, section_manifest_json,
    validation_summary_json, generated_by, generated_at
  ) values (
    v_packet.id, v_packet.organisation_id, v_next_version, coalesce(nullif(trim(p_render_status), ''), 'draft'),
    p_rendered_document_id, nullif(trim(p_rendered_file_path), ''), nullif(trim(p_rendered_file_name), ''), nullif(trim(p_rendered_file_url), ''),
    coalesce(p_placeholders_resolved_json, '{}'::jsonb), coalesce(p_placeholders_missing_json, '[]'::jsonb),
    coalesce(p_section_manifest_json, '[]'::jsonb), coalesce(p_validation_summary_json, '{}'::jsonb),
    coalesce(v_actor, p_generated_by), coalesce(p_generated_at, now())
  ) returning * into v_version;

  update public.document_packets
  set current_version_number = v_next_version
  where id = v_packet.id;

  insert into public.document_packet_events (
    packet_id, organisation_id, version_id, event_type, event_payload_json, created_by, created_at
  ) values (
    v_packet.id, v_packet.organisation_id, v_version.id, 'version_created',
    jsonb_build_object(
      'versionNumber', v_next_version,
      'renderStatus', v_version.render_status,
      'renderedDocumentId', v_version.rendered_document_id,
      'generationAttemptId', coalesce(p_validation_summary_json->>'generationAttemptId', p_validation_summary_json#>>'{generationPayload,generationAttemptId}')
    ),
    coalesce(v_actor, p_generated_by), coalesce(p_generated_at, now())
  );

  return jsonb_build_object('contract', 'i1-v1', 'dryRun', false, 'version', to_jsonb(v_version));
end;
$$;

revoke all on function public.bridge_create_document_packet_version_i1(uuid, text, uuid, text, text, text, jsonb, jsonb, jsonb, jsonb, uuid, timestamptz, boolean) from public, anon;
grant execute on function public.bridge_create_document_packet_version_i1(uuid, text, uuid, text, text, text, jsonb, jsonb, jsonb, jsonb, uuid, timestamptz, boolean) to authenticated, service_role;

commit;
