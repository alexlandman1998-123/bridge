begin;

alter table public.document_packet_template_versions
  add column if not exists canonical_runtime_binding_version text,
  add column if not exists canonical_template_asset_version text,
  add column if not exists reference_matrix_version text,
  add column if not exists certification_key text,
  add column if not exists template_fingerprint text,
  add column if not exists certified_at timestamptz;

create index if not exists document_packet_template_versions_canonical_rollout_idx
  on public.document_packet_template_versions (template_id, status, certified_at desc)
  where canonical_contract_version is not null;

create or replace function public.activate_canonical_otp_candidate(
  p_template_id uuid,
  p_candidate_version_id uuid,
  p_certification_key text,
  p_template_fingerprint text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_template public.document_packet_templates%rowtype;
  v_live public.document_packet_template_versions%rowtype;
  v_candidate public.document_packet_template_versions%rowtype;
  v_approval public.document_template_approvals%rowtype;
  v_matrix jsonb;
  v_asset jsonb;
  v_user_id uuid := auth.uid();
  v_now timestamptz := now();
  v_certification_key text := btrim(coalesce(p_certification_key, ''));
  v_template_fingerprint text := btrim(coalesce(p_template_fingerprint, ''));
begin
  if v_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if p_template_id is null or p_candidate_version_id is null then
    raise exception 'A canonical template and candidate version are required.' using errcode = '22023';
  end if;
  if v_certification_key = '' or v_template_fingerprint = '' then
    raise exception 'The Phase 5 certification key and fingerprint are required.' using errcode = '22023';
  end if;

  select * into v_template
  from public.document_packet_templates
  where id = p_template_id
  for update;

  if v_template.id is null then
    raise exception 'Canonical OTP template not found.' using errcode = 'P0002';
  end if;
  if not public.bridge_is_org_admin(v_template.organisation_id) and not public.bridge_is_platform_admin() then
    raise exception 'Only an authorised organisation administrator can activate the canonical OTP.' using errcode = '42501';
  end if;
  if lower(coalesce(v_template.packet_type, '')) <> 'otp'
    or coalesce(v_template.document_model, '') <> 'single_master_document' then
    raise exception 'Controlled activation is restricted to single-master OTP templates.' using errcode = '22023';
  end if;
  if v_template.live_version_id is null or v_template.candidate_version_id is null then
    raise exception 'Both a current live version and a candidate version are required.' using errcode = '55000';
  end if;
  if v_template.candidate_version_id <> p_candidate_version_id then
    raise exception 'The requested version is no longer the current rollout candidate.' using errcode = '55000';
  end if;

  select * into v_live
  from public.document_packet_template_versions
  where id = v_template.live_version_id and template_id = v_template.id
  for update;

  select * into v_candidate
  from public.document_packet_template_versions
  where id = p_candidate_version_id and template_id = v_template.id
  for update;

  if v_live.id is null or v_candidate.id is null then
    raise exception 'The live or candidate OTP version no longer exists.' using errcode = 'P0002';
  end if;
  if v_live.status <> 'published' or v_candidate.status <> 'approved' then
    raise exception 'The current version must be published and the candidate must be approved.' using errcode = '55000';
  end if;
  if v_candidate.based_on_live_version_id is distinct from v_live.id then
    raise exception 'The candidate was not prepared from the current live OTP.' using errcode = '55000';
  end if;
  if coalesce(v_candidate.canonical_contract_version, '') <> 'kingstons_2026_otp_phase_1_v1'
    or coalesce(v_candidate.canonical_runtime_binding_version, v_candidate.metadata_json ->> 'canonical_runtime_binding_version', '') <> 'kingstons_2026_otp_runtime_v1'
    or coalesce(v_candidate.canonical_template_asset_version, v_candidate.metadata_json ->> 'canonical_template_asset_version', '') <> 'kingstons_2026_otp_docx_v1' then
    raise exception 'The candidate does not use the supported canonical OTP contracts.' using errcode = '55000';
  end if;
  if nullif(btrim(coalesce(v_candidate.storage_bucket, '')), '') is null
    or nullif(btrim(coalesce(v_candidate.storage_path, '')), '') is null then
    raise exception 'The candidate canonical DOCX is not stored.' using errcode = '55000';
  end if;

  v_matrix := coalesce(v_template.metadata_json -> 'last_canonical_otp_reference_matrix', '{}'::jsonb);
  v_asset := coalesce(v_matrix -> 'assetEvidence', '{}'::jsonb);
  if coalesce(v_template.metadata_json ->> 'canonical_otp_reference_matrix_version', '') <> 'kingstons_2026_otp_reference_matrix_v1'
    or coalesce((v_matrix ->> 'canPublish')::boolean, false) is not true
    or coalesce((v_matrix ->> 'failedCount')::integer, 1) <> 0
    or coalesce((v_matrix ->> 'scenarioCount')::integer, 0) < 6
    or coalesce((v_matrix ->> 'passedCount')::integer, 0) <> coalesce((v_matrix ->> 'scenarioCount')::integer, -1)
    or coalesce(v_matrix ->> 'certificationKey', '') <> v_certification_key
    or coalesce(v_matrix ->> 'templateFingerprint', '') <> v_template_fingerprint then
    raise exception 'The saved Phase 5 reference certification is missing, failing, or stale.' using errcode = '55000';
  end if;
  if coalesce(v_asset ->> 'docxSha256', '') = ''
    or coalesce(v_candidate.content_hash, '') <> coalesce(v_asset ->> 'docxSha256', '') then
    raise exception 'The candidate DOCX hash does not match the certified asset.' using errcode = '55000';
  end if;

  select * into v_approval
  from public.document_template_approvals
  where template_id = v_template.id
    and template_version_id = v_candidate.id
    and is_current is true
  for update;

  if v_approval.id is null
    or v_approval.decision <> 'approved'
    or v_approval.decided_at is null
    or nullif(btrim(coalesce(v_approval.reviewer_name, '')), '') is null
    or nullif(btrim(coalesce(v_approval.reviewer_role, '')), '') is null
    or coalesce(v_approval.template_fingerprint, '') <> v_template_fingerprint then
    raise exception 'A current attorney approval for this exact certified candidate is required.' using errcode = '55000';
  end if;

  update public.document_packet_template_versions
  set status = 'superseded',
      updated_by = v_user_id,
      updated_at = v_now
  where id = v_live.id;

  update public.document_packet_template_versions
  set status = 'published',
      previous_version_id = v_live.id,
      reference_matrix_version = 'kingstons_2026_otp_reference_matrix_v1',
      certification_key = v_certification_key,
      template_fingerprint = v_template_fingerprint,
      certified_at = coalesce(certified_at, nullif(v_matrix ->> 'validatedAt', '')::timestamptz, v_now),
      published_by = v_user_id,
      published_at = v_now,
      updated_by = v_user_id,
      updated_at = v_now
  where id = v_candidate.id;

  update public.document_packet_templates
  set live_version_id = v_candidate.id,
      candidate_version_id = null,
      previous_live_version_id = v_live.id,
      template_storage_bucket = v_candidate.storage_bucket,
      template_storage_path = v_candidate.storage_path,
      template_file_name = v_candidate.file_name,
      version_tag = v_candidate.version_tag,
      status = 'published',
      is_active = true,
      is_default = true,
      metadata_json = coalesce(metadata_json, '{}'::jsonb) || jsonb_build_object(
        'otp_rollout', jsonb_build_object(
          'schemaVersion', 'kingstons_2026_otp_rollout_v1',
          'status', 'activated',
          'activatedAt', v_now,
          'activatedVersionId', v_candidate.id,
          'previousVersionId', v_live.id,
          'certificationKey', v_certification_key,
          'templateFingerprint', v_template_fingerprint,
          'approvedBy', v_approval.reviewer_name,
          'approvedByRole', v_approval.reviewer_role
        )
      ),
      updated_by = v_user_id,
      updated_at = v_now
  where id = v_template.id;

  insert into public.security_audit_events (user_id, workspace_id, action, target_type, target_id, metadata)
  values (
    v_user_id,
    v_template.organisation_id,
    'canonical_otp_candidate_activated',
    'document_packet_template_version',
    v_candidate.id::text,
    jsonb_build_object(
      'schemaVersion', 'kingstons_2026_otp_rollout_v1',
      'templateId', v_template.id,
      'fromVersionId', v_live.id,
      'toVersionId', v_candidate.id,
      'certificationKey', v_certification_key,
      'templateFingerprint', v_template_fingerprint,
      'approvalId', v_approval.id,
      'occurredAt', v_now
    )
  );

  return jsonb_build_object(
    'activated', true,
    'templateId', v_template.id,
    'liveVersionId', v_candidate.id,
    'previousLiveVersionId', v_live.id,
    'activatedAt', v_now,
    'certificationKey', v_certification_key,
    'templateFingerprint', v_template_fingerprint
  );
end;
$$;

revoke all on function public.activate_canonical_otp_candidate(uuid, uuid, text, text) from public, anon;
grant execute on function public.activate_canonical_otp_candidate(uuid, uuid, text, text) to authenticated;

comment on function public.activate_canonical_otp_candidate(uuid, uuid, text, text) is
  'Atomically activates a Phase 5-certified and attorney-approved canonical OTP candidate while preserving the previous live version for rollback.';

commit;
