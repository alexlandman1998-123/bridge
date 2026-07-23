begin;

-- D1: verify that a generated PDF version reports the exact C4 frozen source
-- identity before treating the render as deterministically linked.

alter table public.document_packet_versions
  add column if not exists render_input_verified boolean not null default false,
  add column if not exists render_input_verified_at timestamptz;

create or replace function public.bridge_verify_frozen_render_output_d1(
  p_packet_id uuid,
  p_freeze_id uuid,
  p_generated_version_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source public.document_packet_versions%rowtype;
  v_generated public.document_packet_versions%rowtype;
  v_provenance jsonb;
  v_actor uuid := auth.uid();
begin
  if auth.role() <> 'service_role' and not public.bridge_can_access_legal_packet_h2(p_packet_id) then
    raise exception 'Packet generation authority is required.' using errcode = '42501';
  end if;

  select * into v_source
  from public.document_packet_versions
  where packet_id = p_packet_id and render_freeze_id = p_freeze_id;
  if not found then raise exception 'Frozen render source not found.' using errcode = 'P0002'; end if;

  select * into v_generated
  from public.document_packet_versions
  where packet_id = p_packet_id and id = p_generated_version_id
  for update;
  if not found then raise exception 'Generated packet version not found.' using errcode = 'P0002'; end if;
  if v_generated.render_status <> 'generated' then
    raise exception 'The target packet version is not a generated document.';
  end if;

  v_provenance := coalesce(
    v_generated.validation_summary_json->'render_provenance',
    v_generated.validation_summary_json->'renderProvenance',
    '{}'::jsonb
  );
  if coalesce(v_provenance->>'frozenInputContract', '') <> 'd1-v1'
     or coalesce(v_provenance->>'editableRenderFreezeId', '') <> p_freeze_id::text
     or coalesce(v_provenance->>'editableSourceVersionId', '') <> v_source.id::text
     or coalesce(v_provenance->>'editableSourceFingerprint', '') <> v_source.render_content_fingerprint then
    raise exception 'Generated PDF provenance does not match the frozen editable revision.'
      using errcode = '22000', detail = 'FROZEN_RENDER_PROVENANCE_MISMATCH';
  end if;

  update public.document_packet_versions
  set
    render_input_verified = true,
    render_input_verified_at = now(),
    render_source_version_id = v_source.id,
    render_source_fingerprint = v_source.render_content_fingerprint
  where id = v_generated.id
  returning * into v_generated;

  insert into public.document_packet_events (
    packet_id, organisation_id, version_id, event_type, event_payload_json, created_by
  )
  select p.id, p.organisation_id, v_generated.id, 'frozen_render_output_verified',
    jsonb_build_object(
      'contract', 'd1-v1',
      'freezeId', p_freeze_id,
      'sourceVersionId', v_source.id,
      'generatedVersionId', v_generated.id,
      'contentFingerprint', v_source.render_content_fingerprint,
      'verifiedAt', v_generated.render_input_verified_at
    ), v_actor
  from public.document_packets p where p.id = p_packet_id;

  return jsonb_build_object(
    'contract', 'd1-v1',
    'verified', true,
    'freezeId', p_freeze_id,
    'sourceVersionId', v_source.id,
    'generatedVersionId', v_generated.id,
    'contentFingerprint', v_source.render_content_fingerprint,
    'verifiedAt', v_generated.render_input_verified_at
  );
end;
$$;

revoke all on function public.bridge_verify_frozen_render_output_d1(uuid, uuid, uuid) from public, anon;
grant execute on function public.bridge_verify_frozen_render_output_d1(uuid, uuid, uuid) to authenticated, service_role;

commit;
