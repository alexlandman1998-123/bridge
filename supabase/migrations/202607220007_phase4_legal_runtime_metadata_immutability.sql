begin;

-- B4 correctly makes published template source/layout immutable.  B3 and C3
-- are the two service-owned legal-review transitions that must still record
-- their audited runtime metadata on that same immutable revision.  Keep this
-- exception deliberately narrow: it is transaction-local, service-role-only,
-- mode-specific, and cannot alter any non-legal metadata or template source.
create or replace function public.bridge_legal_runtime_metadata_transition_phase4(
  p_old jsonb,
  p_new jsonb,
  p_mutation_kind text
)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
declare
  v_allowed_keys text[];
begin
  case lower(coalesce(p_mutation_kind, ''))
    when 'b3' then
      v_allowed_keys := array[
        'legal_review_status',
        'legal_approved_at',
        'legal_approval_reference',
        'legal_approved_by',
        'legal_approval_content_digest',
        'legal_counsel_review_evidence_digest',
        'legal_b1_manifest_digest',
        'legal_b3_applied_at',
        'legal_b3_applied_by',
        'legal_b3_application_reference',
        'legal_phase4_b3_release_contract',
        'legal_revoked_at',
        'legal_revocation_reason',
        'legal_approval_history'
      ];
    when 'c3' then
      v_allowed_keys := array[
        'legal_review_status',
        'legal_approved_at',
        'legal_approval_reference',
        'legal_approved_by',
        'legal_approval_content_digest',
        'legal_counsel_review_evidence_digest',
        'legal_b1_manifest_digest',
        'legal_b3_applied_at',
        'legal_b3_applied_by',
        'legal_b3_application_reference',
        'legal_phase4_b3_release_contract',
        'legal_revoked_at',
        'legal_revocation_reason',
        'legal_c3_restarted_at',
        'legal_c3_restarted_by',
        'legal_c3_restart_reference',
        'legal_c3_previous_manifest_digest',
        'legal_approval_history'
      ];
    else
      return false;
  end case;

  return (coalesce(p_old, '{}'::jsonb) - v_allowed_keys)
    = (coalesce(p_new, '{}'::jsonb) - v_allowed_keys);
end;
$$;

create or replace function public.bridge_guard_published_template_revision_b4()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_runtime_mutation text := lower(coalesce(current_setting('bridge.legal_runtime_metadata_mutation', true), ''));
  v_legal_metadata_transition_allowed boolean;
begin
  if old.status = 'archived' and new.status is distinct from old.status then
    raise exception 'Archived template revisions are immutable. Create a new draft revision.'
      using errcode = '55000';
  end if;

  v_legal_metadata_transition_allowed :=
    old.status = 'published'
    and new.status is not distinct from old.status
    and lower(coalesce(old.packet_type, '')) in ('otp', 'mandate')
    and coalesce(auth.role(), '') = 'service_role'
    and v_runtime_mutation in ('b3', 'c3')
    and public.bridge_legal_runtime_metadata_transition_phase4(
      old.metadata_json,
      new.metadata_json,
      v_runtime_mutation
    );

  if old.status in ('published', 'archived') and (
    new.organisation_id is distinct from old.organisation_id
    or new.module_type is distinct from old.module_type
    or new.packet_type is distinct from old.packet_type
    or new.template_key is distinct from old.template_key
    or new.template_label is distinct from old.template_label
    or new.template_format is distinct from old.template_format
    or new.template_storage_bucket is distinct from old.template_storage_bucket
    or new.template_storage_path is distinct from old.template_storage_path
    or new.template_file_name is distinct from old.template_file_name
    or new.version_tag is distinct from old.version_tag
    or new.description is distinct from old.description
    or (
      new.metadata_json is distinct from old.metadata_json
      and not v_legal_metadata_transition_allowed
    )
    or (
      new.definition_json is distinct from old.definition_json
      and new.definition_json is distinct from public.bridge_build_template_definition_b1(old.id)
    )
    or new.revision_root_template_id is distinct from old.revision_root_template_id
    or new.revision_parent_template_id is distinct from old.revision_parent_template_id
    or new.revision_number is distinct from old.revision_number
  ) then
    raise exception 'Published template revisions are immutable. Create a new draft revision.'
      using errcode = '55000';
  end if;
  return new;
end;
$$;

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
  v_b1_manifest_digest text;
  v_history jsonb;
  v_results jsonb := '[]'::jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service_role required' using errcode = '42501';
  end if;
  v_b1_manifest_digest := lower(trim(coalesce(p_b1_manifest_digest, '')));
  if v_b1_manifest_digest !~ '^sha256:[0-9a-f]{64}$' then
    raise exception 'A valid B1 manifest digest is required.';
  end if;
  if coalesce(jsonb_typeof(p_approvals), '') <> 'array' or jsonb_array_length(p_approvals) = 0 or jsonb_array_length(p_approvals) > 10 then
    raise exception 'Approval batch must contain between 1 and 10 templates.';
  end if;
  if (select count(distinct item->>'templateId') from jsonb_array_elements(p_approvals) item) <> jsonb_array_length(p_approvals) then
    raise exception 'Approval batch contains duplicate template IDs.';
  end if;
  if coalesce(trim(p_applied_by), '') = '' or coalesce(trim(p_application_reference), '') = '' then
    raise exception 'Accountable B3 operator and application reference are required.';
  end if;

  perform set_config('bridge.legal_runtime_metadata_mutation', 'b3', true);

  -- Acquire template locks in a deterministic order so overlapping B3 batches
  -- cannot deadlock merely because callers supplied the same IDs differently.
  for v_item in
    select value
    from jsonb_array_elements(p_approvals)
    order by value->>'templateId'
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
      or v_reviewed_at is null
      or not isfinite(v_reviewed_at)
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
    -- C3 binds a published revision to the next B1 manifest before B2/B3
    -- can resume. A stale B3 operator must never be able to overwrite that
    -- binding and resurrect approval for an earlier review set.
    if nullif(v_template.metadata_json->>'legal_b1_manifest_digest', '') is not null
      and v_template.metadata_json->>'legal_b1_manifest_digest' <> v_b1_manifest_digest then
      raise exception 'Template % approval belongs to a different B1 manifest.', v_template_id;
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
      'legal_b1_manifest_digest', v_b1_manifest_digest,
      'legal_b3_applied_at', to_jsonb(now()),
      'legal_b3_applied_by', p_applied_by,
      'legal_b3_application_reference', p_application_reference,
      'legal_phase4_b3_release_contract', 'phase4-b3-integrity-v1',
      'legal_revoked_at', null,
      'legal_revocation_reason', null,
      'legal_approval_history', v_history || jsonb_build_array(jsonb_build_object(
        'action', 'approved',
        'approvedAt', v_reviewed_at,
        'approvedBy', v_reviewed_by,
        'reference', v_review_reference,
        'contentDigest', v_content_digest,
        'reviewEvidenceDigest', v_evidence_digest,
        'b1ManifestDigest', v_b1_manifest_digest,
        'b3AppliedBy', p_applied_by,
        'b3ApplicationReference', p_application_reference,
        'phase4B3ReleaseContract', 'phase4-b3-integrity-v1',
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
        'b1ManifestDigest', v_b1_manifest_digest,
        'reviewReference', v_review_reference,
        'reviewedBy', v_reviewed_by,
        'reviewedAt', v_reviewed_at,
        'b3AppliedBy', p_applied_by,
        'b3ApplicationReference', p_application_reference,
        'phase4B3ReleaseContract', 'phase4-b3-integrity-v1'
      )
    );
    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'templateId', v_template_id,
      'packetType', v_packet_type,
      'contentDigest', v_content_digest,
      'reviewEvidenceDigest', v_evidence_digest
    ));
  end loop;

  perform set_config('bridge.legal_runtime_metadata_mutation', '', true);
  return jsonb_build_object('success', true, 'count', jsonb_array_length(v_results), 'templates', v_results);
end;
$$;

revoke all on function public.bridge_apply_legal_document_counsel_approvals(text, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.bridge_apply_legal_document_counsel_approvals(text, jsonb, text, text) to service_role;

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
  v_previous_manifest_digest text;
  v_next_manifest_digest text;
  v_history jsonb;
  v_results jsonb := '[]'::jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service_role required' using errcode = '42501';
  end if;
  v_previous_manifest_digest := lower(trim(coalesce(p_previous_manifest_digest, '')));
  v_next_manifest_digest := lower(trim(coalesce(p_next_manifest_digest, '')));
  if v_previous_manifest_digest !~ '^sha256:[0-9a-f]{64}$'
    or v_next_manifest_digest !~ '^sha256:[0-9a-f]{64}$'
    or v_previous_manifest_digest = v_next_manifest_digest then
    raise exception 'Distinct valid previous and next B1 manifest digests are required.';
  end if;
  if coalesce(array_length(p_template_ids, 1), 0) = 0 or array_length(p_template_ids, 1) > 10
    or (select count(distinct value) from unnest(p_template_ids) value) <> array_length(p_template_ids, 1) then
    raise exception 'C3 requires between 1 and 10 unique template IDs.';
  end if;
  if coalesce(trim(p_restarted_by), '') = '' or coalesce(trim(p_restart_reference), '') = '' then
    raise exception 'Accountable C3 operator and restart reference are required.';
  end if;

  perform set_config('bridge.legal_runtime_metadata_mutation', 'c3', true);

  -- C3 uses the same deterministic lock order as B3.
  for v_template_id in
    select template_id
    from unnest(p_template_ids) as items(template_id)
    order by template_id
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
      and v_template.metadata_json->>'legal_b1_manifest_digest' <> v_previous_manifest_digest then
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
      'legal_b1_manifest_digest', v_next_manifest_digest,
      'legal_b3_applied_at', null,
      'legal_b3_applied_by', null,
      'legal_b3_application_reference', null,
      'legal_phase4_b3_release_contract', null,
      'legal_revoked_at', now(),
      'legal_revocation_reason', 'C3 legal review cycle restarted after governed source change',
      'legal_c3_restarted_at', now(),
      'legal_c3_restarted_by', p_restarted_by,
      'legal_c3_restart_reference', p_restart_reference,
      'legal_c3_previous_manifest_digest', v_previous_manifest_digest,
      'legal_approval_history', v_history || jsonb_build_array(jsonb_build_object(
        'action', 'review_cycle_restarted',
        'previousManifestDigest', v_previous_manifest_digest,
        'nextManifestDigest', v_next_manifest_digest,
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
        'previousManifestDigest', v_previous_manifest_digest,
        'nextManifestDigest', v_next_manifest_digest,
        'restartedBy', p_restarted_by,
        'restartReference', p_restart_reference
      )
    );
    v_results := v_results || jsonb_build_array(jsonb_build_object('templateId', v_template_id));
  end loop;

  perform set_config('bridge.legal_runtime_metadata_mutation', '', true);
  return jsonb_build_object('success', true, 'count', jsonb_array_length(v_results), 'templates', v_results);
end;
$$;

revoke all on function public.bridge_restart_legal_document_review_cycle(text, text, uuid[], text, text) from public, anon, authenticated;
grant execute on function public.bridge_restart_legal_document_review_cycle(text, text, uuid[], text, text) to service_role;

comment on function public.bridge_legal_runtime_metadata_transition_phase4(jsonb, jsonb, text) is
  'Phase 4 narrow B3/C3 metadata transition allowlist used by immutable published-template guard.';

commit;
