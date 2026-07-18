begin;

create or replace function public.bridge_restart_legal_document_review_cycle(
  p_previous_manifest_digest text,
  p_next_manifest_digest text,
  p_template_ids uuid[],
  p_restarted_by text,
  p_restart_reference text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_template public.document_packet_templates%rowtype;
  v_template_id uuid;
  v_history jsonb;
  v_results jsonb := '[]'::jsonb;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role required' using errcode = '42501';
  end if;
  if coalesce(trim(p_previous_manifest_digest), '') !~ '^sha256:[0-9a-f]{64}$'
    or coalesce(trim(p_next_manifest_digest), '') !~ '^sha256:[0-9a-f]{64}$'
    or p_previous_manifest_digest = p_next_manifest_digest then
    raise exception 'Distinct valid previous and next B1 manifest digests are required.';
  end if;
  if coalesce(array_length(p_template_ids, 1), 0) = 0 or array_length(p_template_ids, 1) > 10
    or (select count(distinct value) from unnest(p_template_ids) value) <> array_length(p_template_ids, 1) then
    raise exception 'C3 requires between 1 and 10 unique template IDs.';
  end if;
  if coalesce(trim(p_restarted_by), '') = '' or coalesce(trim(p_restart_reference), '') = '' then
    raise exception 'Accountable C3 operator and restart reference are required.';
  end if;

  foreach v_template_id in array p_template_ids
  loop
    select * into v_template
    from public.document_packet_templates
    where id = v_template_id
    for update;
    if not found then raise exception 'Template % was not found.', v_template_id; end if;
    if lower(coalesce(v_template.packet_type, '')) not in ('otp', 'mandate')
      or lower(coalesce(v_template.status, '')) <> 'published'
      or coalesce(v_template.is_active, false) is not true then
      raise exception 'Template % is not an active published legal-document route.', v_template_id;
    end if;
    if nullif(v_template.metadata_json->>'legal_b1_manifest_digest', '') is not null
      and v_template.metadata_json->>'legal_b1_manifest_digest' <> p_previous_manifest_digest then
      raise exception 'Template % approval belongs to a different B1 manifest.', v_template_id;
    end if;

    v_history := case
      when jsonb_typeof(v_template.metadata_json->'legal_approval_history') = 'array'
        then v_template.metadata_json->'legal_approval_history'
      else '[]'::jsonb
    end;
    update public.document_packet_templates
    set metadata_json = coalesce(metadata_json, '{}'::jsonb) || jsonb_build_object(
      'legal_review_status', 'pending',
      'legal_approved_at', null,
      'legal_approval_reference', null,
      'legal_approved_by', null,
      'legal_approval_content_digest', null,
      'legal_counsel_review_evidence_digest', null,
      'legal_b1_manifest_digest', p_next_manifest_digest,
      'legal_revoked_at', now(),
      'legal_revocation_reason', 'C3 legal review cycle restarted after governed source change',
      'legal_c3_restarted_at', now(),
      'legal_c3_restarted_by', p_restarted_by,
      'legal_c3_restart_reference', p_restart_reference,
      'legal_c3_previous_manifest_digest', p_previous_manifest_digest,
      'legal_approval_history', v_history || jsonb_build_array(jsonb_build_object(
        'action', 'review_cycle_restarted',
        'previousManifestDigest', p_previous_manifest_digest,
        'nextManifestDigest', p_next_manifest_digest,
        'restartedBy', p_restarted_by,
        'restartReference', p_restart_reference,
        'recordedAt', now()
      ))
    ), updated_at = now()
    where id = v_template_id;

    insert into public.document_packet_template_audit (
      template_id, organisation_id, module_type, packet_type, event_type,
      actor_user_id, actor_role, change_summary, event_payload_json
    ) values (
      v_template.id, v_template.organisation_id, v_template.module_type, v_template.packet_type,
      'legal_review_cycle_restarted', null, 'service_role',
      'C3 legal review cycle restarted atomically',
      jsonb_build_object(
        'previousManifestDigest', p_previous_manifest_digest,
        'nextManifestDigest', p_next_manifest_digest,
        'restartedBy', p_restarted_by,
        'restartReference', p_restart_reference
      )
    );
    v_results := v_results || jsonb_build_array(jsonb_build_object('templateId', v_template_id));
  end loop;

  return jsonb_build_object('success', true, 'count', jsonb_array_length(v_results), 'templates', v_results);
end;
$$;

revoke all on function public.bridge_restart_legal_document_review_cycle(text, text, uuid[], text, text) from public, anon, authenticated;
grant execute on function public.bridge_restart_legal_document_review_cycle(text, text, uuid[], text, text) to service_role;

comment on function public.bridge_restart_legal_document_review_cycle(text, text, uuid[], text, text) is
  'C3 service-role-only atomic invalidation of stale legal approvals before a fresh B1/B2/B3 review cycle.';

commit;
