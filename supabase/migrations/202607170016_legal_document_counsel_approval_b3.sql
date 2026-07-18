begin;

create or replace function public.bridge_apply_legal_document_counsel_approvals(
  p_b1_manifest_digest text,
  p_approvals jsonb,
  p_applied_by text,
  p_application_reference text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_template public.document_packet_templates%rowtype;
  v_template_id uuid;
  v_packet_type text;
  v_decision text;
  v_content_digest text;
  v_evidence_digest text;
  v_reviewed_by text;
  v_reviewed_at timestamptz;
  v_review_reference text;
  v_history jsonb;
  v_results jsonb := '[]'::jsonb;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role required' using errcode = '42501';
  end if;
  if coalesce(trim(p_b1_manifest_digest), '') !~ '^sha256:[0-9a-f]{64}$' then
    raise exception 'A valid B1 manifest digest is required.';
  end if;
  if jsonb_typeof(p_approvals) <> 'array' or jsonb_array_length(p_approvals) = 0 or jsonb_array_length(p_approvals) > 10 then
    raise exception 'Approval batch must contain between 1 and 10 templates.';
  end if;
  if (select count(distinct item->>'templateId') from jsonb_array_elements(p_approvals) item) <> jsonb_array_length(p_approvals) then
    raise exception 'Approval batch contains duplicate template IDs.';
  end if;
  if coalesce(trim(p_applied_by), '') = '' or coalesce(trim(p_application_reference), '') = '' then
    raise exception 'Accountable B3 operator and application reference are required.';
  end if;

  for v_item in select value from jsonb_array_elements(p_approvals)
  loop
    if coalesce(v_item->>'templateId', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception 'Invalid template ID in approval batch.';
    end if;
    v_template_id := (v_item->>'templateId')::uuid;
    v_packet_type := lower(trim(coalesce(v_item->>'packetType', '')));
    v_decision := lower(trim(coalesce(v_item->>'decision', '')));
    v_content_digest := trim(coalesce(v_item->>'contentDigest', ''));
    v_evidence_digest := trim(coalesce(v_item->>'reviewEvidenceDigest', ''));
    v_reviewed_by := trim(coalesce(v_item->>'reviewedBy', ''));
    v_review_reference := trim(coalesce(v_item->>'reviewReference', ''));
    begin
      v_reviewed_at := (v_item->>'reviewedAt')::timestamptz;
    exception when others then
      raise exception 'Invalid counsel review timestamp for template %.', v_template_id;
    end;
    if v_packet_type not in ('otp', 'mandate')
      or v_decision <> 'approved'
      or v_content_digest !~ '^sha256:[0-9a-f]{64}$'
      or v_evidence_digest !~ '^sha256:[0-9a-f]{64}$'
      or v_reviewed_by = ''
      or v_review_reference = ''
      or v_reviewed_at > now() + interval '5 minutes' then
      raise exception 'Incomplete or invalid counsel evidence for template %.', v_template_id;
    end if;

    select * into v_template
    from public.document_packet_templates
    where id = v_template_id
    for update;
    if not found then raise exception 'Template % was not found.', v_template_id; end if;
    if lower(coalesce(v_template.packet_type, '')) <> v_packet_type
      or lower(coalesce(v_template.status, '')) <> 'published'
      or coalesce(v_template.is_active, false) is not true then
      raise exception 'Template % is not an active published % route.', v_template_id, v_packet_type;
    end if;

    v_history := case
      when jsonb_typeof(v_template.metadata_json->'legal_approval_history') = 'array'
        then v_template.metadata_json->'legal_approval_history'
      else '[]'::jsonb
    end;
    update public.document_packet_templates
    set metadata_json = coalesce(metadata_json, '{}'::jsonb) || jsonb_build_object(
      'legal_review_status', 'approved',
      'legal_approved_at', to_jsonb(v_reviewed_at),
      'legal_approval_reference', v_review_reference,
      'legal_approved_by', v_reviewed_by,
      'legal_approval_content_digest', v_content_digest,
      'legal_counsel_review_evidence_digest', v_evidence_digest,
      'legal_b1_manifest_digest', p_b1_manifest_digest,
      'legal_b3_applied_at', to_jsonb(now()),
      'legal_b3_applied_by', p_applied_by,
      'legal_b3_application_reference', p_application_reference,
      'legal_revoked_at', null,
      'legal_revocation_reason', null,
      'legal_approval_history', v_history || jsonb_build_array(jsonb_build_object(
        'action', 'approved',
        'approvedAt', v_reviewed_at,
        'approvedBy', v_reviewed_by,
        'reference', v_review_reference,
        'contentDigest', v_content_digest,
        'reviewEvidenceDigest', v_evidence_digest,
        'b1ManifestDigest', p_b1_manifest_digest,
        'b3AppliedBy', p_applied_by,
        'b3ApplicationReference', p_application_reference,
        'recordedAt', now()
      ))
    ), updated_at = now()
    where id = v_template_id;

    insert into public.document_packet_template_audit (
      template_id, organisation_id, module_type, packet_type, event_type,
      actor_user_id, actor_role, change_summary, event_payload_json
    ) values (
      v_template.id, v_template.organisation_id, v_template.module_type, v_template.packet_type,
      'legal_counsel_approval_applied', null, 'service_role',
      'B3 counsel approval applied atomically',
      jsonb_build_object(
        'contentDigest', v_content_digest,
        'reviewEvidenceDigest', v_evidence_digest,
        'b1ManifestDigest', p_b1_manifest_digest,
        'reviewReference', v_review_reference,
        'reviewedBy', v_reviewed_by,
        'reviewedAt', v_reviewed_at,
        'b3AppliedBy', p_applied_by,
        'b3ApplicationReference', p_application_reference
      )
    );
    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'templateId', v_template_id,
      'packetType', v_packet_type,
      'contentDigest', v_content_digest,
      'reviewEvidenceDigest', v_evidence_digest
    ));
  end loop;

  return jsonb_build_object('success', true, 'count', jsonb_array_length(v_results), 'templates', v_results);
end;
$$;

revoke all on function public.bridge_apply_legal_document_counsel_approvals(text, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.bridge_apply_legal_document_counsel_approvals(text, jsonb, text, text) to service_role;

comment on function public.bridge_apply_legal_document_counsel_approvals(text, jsonb, text, text) is
  'B3 service-role-only atomic promotion of B2 counsel decisions into enforceable legal template approval metadata.';

commit;
