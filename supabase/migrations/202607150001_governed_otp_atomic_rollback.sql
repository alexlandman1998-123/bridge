begin;

create or replace function public.rollback_governed_otp_template(
  p_current_template_id uuid,
  p_rollback_template_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current public.document_packet_templates%rowtype;
  v_target public.document_packet_templates%rowtype;
  v_rollout jsonb;
  v_user_id uuid := auth.uid();
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  if v_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if char_length(v_reason) < 12 then
    raise exception 'A rollback reason of at least 12 characters is required.' using errcode = '22023';
  end if;
  if p_current_template_id is null or p_rollback_template_id is null or p_current_template_id = p_rollback_template_id then
    raise exception 'Two distinct OTP template IDs are required.' using errcode = '22023';
  end if;

  select * into v_current
  from public.document_packet_templates
  where id = p_current_template_id
  for update;

  select * into v_target
  from public.document_packet_templates
  where id = p_rollback_template_id
  for update;

  if v_current.id is null or v_target.id is null then
    raise exception 'The current or rollback OTP template no longer exists.' using errcode = 'P0002';
  end if;
  if v_current.organisation_id is null or v_current.organisation_id <> v_target.organisation_id then
    raise exception 'Both OTP templates must belong to the same organisation.' using errcode = '42501';
  end if;
  if not public.bridge_is_org_admin(v_current.organisation_id) then
    raise exception 'Only an organisation administrator can roll back the live OTP.' using errcode = '42501';
  end if;
  if lower(coalesce(v_current.packet_type, '')) <> 'otp' or lower(coalesce(v_target.packet_type, '')) <> 'otp' then
    raise exception 'Rollback is restricted to OTP templates.' using errcode = '22023';
  end if;
  if not coalesce(v_current.is_default, false) or not coalesce(v_current.is_active, false) then
    raise exception 'The selected current OTP is no longer the active default.' using errcode = '55000';
  end if;
  if not coalesce(v_target.is_active, false) or lower(coalesce(v_target.status, '')) in ('withdrawn', 'superseded') then
    raise exception 'The previous OTP is no longer eligible for restoration.' using errcode = '55000';
  end if;
  if lower(coalesce(v_target.metadata_json ->> 'document_kind', 'standard')) = 'addendum' then
    raise exception 'An addendum cannot be restored as the live OTP.' using errcode = '22023';
  end if;

  v_rollout := coalesce(v_current.metadata_json -> 'otp_rollout', v_current.metadata_json -> 'otpRollout', '{}'::jsonb);
  if lower(coalesce(v_rollout ->> 'status', '')) <> 'activated'
    or coalesce(v_rollout ->> 'previousTemplateId', v_rollout ->> 'previous_template_id', '') <> p_rollback_template_id::text
    or coalesce(v_rollout ->> 'activatedTemplateId', v_rollout ->> 'activated_template_id', p_current_template_id::text) <> p_current_template_id::text then
    raise exception 'The governed activation record does not authorise this rollback target.' using errcode = '55000';
  end if;

  update public.document_packet_templates
  set is_default = false,
      is_active = true,
      updated_at = now()
  where id = p_current_template_id;

  update public.document_packet_templates
  set is_default = true,
      is_active = true,
      status = 'published',
      updated_at = now()
  where id = p_rollback_template_id;

  insert into public.security_audit_events (
    user_id,
    workspace_id,
    action,
    target_type,
    target_id,
    metadata
  ) values (
    v_user_id,
    v_current.organisation_id,
    'otp_governed_template_rolled_back',
    'document_packet_template',
    p_rollback_template_id::text,
    jsonb_build_object(
      'schemaVersion', 'otp_rollout_operations_v1',
      'occurredAt', now(),
      'organisationId', v_current.organisation_id,
      'reason', v_reason,
      'fromTemplate', jsonb_build_object('id', v_current.id, 'label', v_current.template_label),
      'toTemplate', jsonb_build_object('id', v_target.id, 'label', v_target.template_label),
      'activation', jsonb_build_object(
        'activatedAt', coalesce(v_rollout ->> 'activatedAt', v_rollout ->> 'activated_at'),
        'certificationKey', coalesce(v_rollout ->> 'certificationKey', v_rollout ->> 'certification_key'),
        'templateFingerprint', coalesce(v_rollout ->> 'templateFingerprint', v_rollout ->> 'template_fingerprint')
      )
    )
  );

  return jsonb_build_object(
    'rolledBack', true,
    'fromTemplateId', p_current_template_id,
    'toTemplateId', p_rollback_template_id,
    'occurredAt', now()
  );
end;
$$;

revoke all on function public.rollback_governed_otp_template(uuid, uuid, text) from public;
grant execute on function public.rollback_governed_otp_template(uuid, uuid, text) to authenticated;

commit;
