begin;

create or replace function public.rollback_canonical_otp_version(
  p_template_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_template public.document_packet_templates%rowtype;
  v_live public.document_packet_template_versions%rowtype;
  v_previous public.document_packet_template_versions%rowtype;
  v_rollout jsonb;
  v_user_id uuid := auth.uid();
  v_reason text := btrim(coalesce(p_reason, ''));
  v_now timestamptz := now();
begin
  if v_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if p_template_id is null then
    raise exception 'A canonical OTP template is required.' using errcode = '22023';
  end if;
  if char_length(v_reason) < 12 then
    raise exception 'A rollback reason of at least 12 characters is required.' using errcode = '22023';
  end if;

  select * into v_template
  from public.document_packet_templates
  where id = p_template_id
  for update;

  if v_template.id is null then
    raise exception 'Canonical OTP template not found.' using errcode = 'P0002';
  end if;
  if not public.bridge_is_org_admin(v_template.organisation_id) and not public.bridge_is_platform_admin() then
    raise exception 'Only an authorised organisation administrator can restore the previous canonical OTP.' using errcode = '42501';
  end if;
  if lower(coalesce(v_template.packet_type, '')) <> 'otp'
    or coalesce(v_template.document_model, '') <> 'single_master_document' then
    raise exception 'Canonical recovery is restricted to single-master OTP templates.' using errcode = '22023';
  end if;
  if v_template.live_version_id is null
    or v_template.previous_live_version_id is null
    or v_template.live_version_id = v_template.previous_live_version_id then
    raise exception 'A distinct live and previous-live version are required.' using errcode = '55000';
  end if;

  select * into v_live
  from public.document_packet_template_versions
  where id = v_template.live_version_id and template_id = v_template.id
  for update;

  select * into v_previous
  from public.document_packet_template_versions
  where id = v_template.previous_live_version_id and template_id = v_template.id
  for update;

  if v_live.id is null or v_previous.id is null then
    raise exception 'The live or recovery OTP version no longer exists.' using errcode = 'P0002';
  end if;
  if v_live.status <> 'published' or v_previous.status <> 'superseded' then
    raise exception 'The canonical live or recovery version has an invalid status.' using errcode = '55000';
  end if;
  if nullif(btrim(coalesce(v_previous.storage_bucket, '')), '') is null
    or nullif(btrim(coalesce(v_previous.storage_path, '')), '') is null then
    raise exception 'The previous canonical OTP asset is not available.' using errcode = '55000';
  end if;

  v_rollout := coalesce(v_template.metadata_json -> 'otp_rollout', '{}'::jsonb);
  if lower(coalesce(v_rollout ->> 'status', '')) not in ('activated', 'rolled_back') then
    raise exception 'No controlled canonical rollout authorises recovery.' using errcode = '55000';
  end if;

  update public.document_packet_template_versions
  set status = 'superseded',
      updated_by = v_user_id,
      updated_at = v_now
  where id = v_live.id;

  update public.document_packet_template_versions
  set status = 'published',
      published_by = v_user_id,
      published_at = v_now,
      updated_by = v_user_id,
      updated_at = v_now
  where id = v_previous.id;

  update public.document_packet_templates
  set live_version_id = v_previous.id,
      previous_live_version_id = v_live.id,
      candidate_version_id = null,
      template_storage_bucket = v_previous.storage_bucket,
      template_storage_path = v_previous.storage_path,
      template_file_name = v_previous.file_name,
      version_tag = v_previous.version_tag,
      status = 'published',
      is_active = true,
      is_default = true,
      metadata_json = coalesce(metadata_json, '{}'::jsonb) || jsonb_build_object(
        'otp_rollout', jsonb_build_object(
          'schemaVersion', 'kingstons_2026_otp_recovery_v1',
          'status', 'rolled_back',
          'rolledBackAt', v_now,
          'restoredVersionId', v_previous.id,
          'previousVersionId', v_live.id,
          'reason', v_reason
        )
      ),
      updated_by = v_user_id,
      updated_at = v_now
  where id = v_template.id;

  insert into public.security_audit_events (user_id, workspace_id, action, target_type, target_id, metadata)
  values (
    v_user_id,
    v_template.organisation_id,
    'canonical_otp_version_rolled_back',
    'document_packet_template_version',
    v_previous.id::text,
    jsonb_build_object(
      'schemaVersion', 'kingstons_2026_otp_recovery_v1',
      'templateId', v_template.id,
      'fromVersionId', v_live.id,
      'toVersionId', v_previous.id,
      'reason', v_reason,
      'occurredAt', v_now
    )
  );

  return jsonb_build_object(
    'rolledBack', true,
    'templateId', v_template.id,
    'fromVersionId', v_live.id,
    'liveVersionId', v_previous.id,
    'previousLiveVersionId', v_live.id,
    'occurredAt', v_now
  );
end;
$$;

revoke all on function public.rollback_canonical_otp_version(uuid, text) from public, anon;
grant execute on function public.rollback_canonical_otp_version(uuid, text) to authenticated;

comment on function public.rollback_canonical_otp_version(uuid, text) is
  'Atomically restores the retained previous canonical OTP version and preserves the displaced version as the next recovery anchor.';

commit;
