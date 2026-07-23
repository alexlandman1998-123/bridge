begin;

-- A canonical OTP render must either become a complete D1 -> D2 -> D3 -> C4
-- chain or leave the packet pointer on the frozen editable source.  The first
-- Phase 2 seal function deliberately makes D1--D3/C4 atomic, but the I1
-- version creation previously happened in a separate RPC.  Keeping both
-- operations in this service-only transaction means a certification failure
-- cannot strand an unsealed generated version as the packet's current head.
create or replace function public.bridge_create_and_seal_canonical_otp_pdf_phase2(
  p_packet_id uuid,
  p_freeze_id uuid,
  p_rendered_document_id uuid,
  p_rendered_file_path text,
  p_rendered_file_name text,
  p_rendered_file_url text default null,
  p_placeholders_resolved_json jsonb default '{}'::jsonb,
  p_placeholders_missing_json jsonb default '[]'::jsonb,
  p_section_manifest_json jsonb default '[]'::jsonb,
  p_validation_summary_json jsonb default '{}'::jsonb,
  p_generated_by uuid default null,
  p_generated_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_i1 jsonb;
  v_version_id uuid;
  v_seal jsonb;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Only the canonical OTP rendering service may create and seal an OTP PDF.'
      using errcode = '42501', detail = 'PHASE2_OTP_CANONICAL_RENDER_SERVICE_ONLY';
  end if;

  select public.bridge_create_document_packet_version_i1(
    p_packet_id => p_packet_id,
    p_render_status => 'generated',
    p_rendered_document_id => p_rendered_document_id,
    p_rendered_file_path => p_rendered_file_path,
    p_rendered_file_name => p_rendered_file_name,
    p_rendered_file_url => p_rendered_file_url,
    p_placeholders_resolved_json => coalesce(p_placeholders_resolved_json, '{}'::jsonb),
    p_placeholders_missing_json => coalesce(p_placeholders_missing_json, '[]'::jsonb),
    p_section_manifest_json => coalesce(p_section_manifest_json, '[]'::jsonb),
    p_validation_summary_json => coalesce(p_validation_summary_json, '{}'::jsonb),
    p_generated_by => p_generated_by,
    p_generated_at => coalesce(p_generated_at, now()),
    p_dry_run => false
  ) into v_i1;

  v_version_id := nullif(v_i1 #>> '{version,id}', '')::uuid;
  if v_version_id is null then
    raise exception 'The canonical OTP version was not created.'
      using errcode = 'P0001', detail = 'PHASE2_OTP_VERSION_CREATE_FAILED';
  end if;

  select public.bridge_seal_canonical_otp_pdf_phase2(
    p_packet_id,
    p_freeze_id,
    v_version_id
  ) into v_seal;

  if coalesce((v_seal->>'sealed')::boolean, false) is not true then
    raise exception 'The canonical OTP PDF could not be sealed.'
      using errcode = '22000', detail = 'PHASE2_OTP_SEAL_FAILED';
  end if;

  return jsonb_build_object(
    'contract', 'phase2-canonical-otp-pdf-v1',
    'sealed', true,
    'packetId', p_packet_id,
    'freezeId', p_freeze_id,
    'version', v_i1->'version',
    'seal', v_seal
  );
end;
$$;

revoke all on function public.bridge_create_and_seal_canonical_otp_pdf_phase2(
  uuid, uuid, uuid, text, text, text, jsonb, jsonb, jsonb, jsonb, uuid, timestamptz
) from public, anon, authenticated;
grant execute on function public.bridge_create_and_seal_canonical_otp_pdf_phase2(
  uuid, uuid, uuid, text, text, text, jsonb, jsonb, jsonb, jsonb, uuid, timestamptz
) to service_role;

comment on function public.bridge_create_and_seal_canonical_otp_pdf_phase2(
  uuid, uuid, uuid, text, text, text, jsonb, jsonb, jsonb, jsonb, uuid, timestamptz
) is 'Phase 2 service-only OTP I1 plus D1/D2/D3/C4 transaction. A failed seal rolls back the generated packet version and packet pointer.';

commit;
