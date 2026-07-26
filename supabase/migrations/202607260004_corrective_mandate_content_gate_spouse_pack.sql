begin;

-- Corrective migration for the global mandate content gate.
-- B4 makes published template revisions immutable, so repair the live Arch9
-- mandate default by publishing a successor revision instead of editing the
-- current published sections in place.

do $$
declare
  v_source_template public.document_packet_templates%rowtype;
  v_template_id uuid;
  v_root_template_id uuid;
  v_revision_number integer;
  v_version_tag text;
  v_needs_repair boolean := false;
  v_bad_pack_count integer := 0;
  v_active_default_count integer := 0;
begin
  select template.*
    into v_source_template
  from public.document_packet_templates template
  where template.organisation_id is null
    and lower(coalesce(template.module_type, '')) = 'agency'
    and lower(coalesce(template.packet_type, '')) = 'mandate'
    and template.template_key = 'mandate_default_v1'
    and lower(coalesce(template.status, '')) = 'published'
    and template.is_active = true
    and template.is_default = true
  order by template.revision_number desc nulls last, template.updated_at desc nulls last, template.created_at desc nulls last
  limit 1;

  if v_source_template.id is null then
    raise exception 'Mandate spouse-pack corrective migration requires an active published global mandate_default_v1 template.'
      using errcode = '23514';
  end if;

  select exists (
    select 1
    from public.document_template_sections section
    where section.template_id = v_source_template.id
      and section.section_key = 'seller_individual_capacity_pack'
      and (
        coalesce(section.placeholder_keys, array[]::text[]) && array['seller_spouse_consent_required']::text[]
        or coalesce(section.legal_text, '') ~* '\{\{\s*seller_spouse_consent_required\s*\}\}'
        or coalesce(section.legal_text, '') ~* 'spouse consent required'
      )
  ) into v_needs_repair;

  if v_needs_repair then
    v_root_template_id := coalesce(v_source_template.revision_root_template_id, v_source_template.id);

    select coalesce(max(template.revision_number), 0) + 1
      into v_revision_number
    from public.document_packet_templates template
    where coalesce(template.revision_root_template_id, template.id) = v_root_template_id;

    v_version_tag := 'content-gate-v' || v_revision_number::text;

    while exists (
      select 1
      from public.document_packet_templates template
      where template.organisation_id is null
        and template.template_key = 'mandate_default_v1'
        and template.version_tag = v_version_tag
    ) loop
      v_revision_number := v_revision_number + 1;
      v_version_tag := 'content-gate-v' || v_revision_number::text;
    end loop;

    insert into public.document_packet_templates (
      organisation_id,
      module_type,
      packet_type,
      template_key,
      template_label,
      template_format,
      template_storage_bucket,
      template_storage_path,
      template_file_name,
      version_tag,
      description,
      is_default,
      is_active,
      metadata_json,
      created_by,
      updated_by,
      published_by,
      published_at,
      status,
      content_hash,
      change_summary,
      document_model,
      canonical_contract_version,
      definition_schema_version,
      definition_json,
      revision_root_template_id,
      revision_parent_template_id,
      revision_number
    )
    values (
      null,
      v_source_template.module_type,
      v_source_template.packet_type,
      v_source_template.template_key,
      v_source_template.template_label,
      'structured',
      null,
      null,
      null,
      v_version_tag,
      coalesce(v_source_template.description, 'Global mandate platform default revision.'),
      false,
      false,
      (
        coalesce(v_source_template.metadata_json, '{}'::jsonb)
          - 'template_storage_bucket' - 'template_bucket' - 'templateBucket'
          - 'template_storage_path' - 'templatePath'
          - 'template_file_name' - 'template_filename' - 'templateFilename'
          - 'legal_review_status' - 'legalApprovalStatus'
          - 'legal_approved_at' - 'legalApprovedAt'
          - 'legal_approval_reference' - 'legalApprovalReference'
          - 'legal_approved_by' - 'legalApprovedBy'
          - 'legal_approval_content_digest' - 'legalApprovalContentDigest'
          - 'legal_counsel_review_evidence_digest' - 'legalCounselReviewEvidenceDigest'
          - 'legal_b1_manifest_digest' - 'legalB1ManifestDigest'
          - 'legal_b3_applied_at' - 'legalB3AppliedAt'
          - 'legal_b3_applied_by' - 'legalB3AppliedBy'
          - 'legal_b3_application_reference' - 'legalB3ApplicationReference'
          - 'legal_phase4_b3_release_contract' - 'legalPhase4B3ReleaseContract'
          - 'legal_revoked_at' - 'legalRevokedAt'
          - 'legal_revocation_reason' - 'legalRevocationReason'
          - 'legal_approval_history'
          - 'legal_review' - 'legalReview'
      ) || jsonb_build_object(
        'template_scope', 'global_default',
        'content_gate_repair_version', 'mandate-content-gate-v2',
        'content_gate_repair_applied_at', now(),
        'content_gate_repair_reason', 'Seller spouse consent wording is isolated to the Seller Spouse Consent Pack.',
        'approved_default_route_scan', 'default',
        'render_mode', 'native_structured',
        'native_template', true,
        'mandate_template_variant', 'default',
        'mandateTemplateVariant', 'default',
        'conditional_master', true,
        'platform_default_can_route_without_org_template', true
      ),
      v_source_template.created_by,
      v_source_template.updated_by,
      v_source_template.published_by,
      null,
      'draft',
      v_source_template.content_hash,
      'Corrective mandate content-gate revision: keep spouse-consent wording only in the spouse-consent conditional pack.',
      v_source_template.document_model,
      v_source_template.canonical_contract_version,
      v_source_template.definition_schema_version,
      coalesce(v_source_template.definition_json, '{}'::jsonb),
      v_root_template_id,
      v_source_template.id,
      v_revision_number
    )
    returning id into v_template_id;

    insert into public.document_template_sections (
      template_id,
      section_key,
      section_label,
      section_type,
      sort_order,
      is_required,
      is_repeatable,
      condition_json,
      placeholder_keys,
      legal_text,
      metadata_json
    )
    select
      v_template_id,
      section.section_key,
      section.section_label,
      section.section_type,
      section.sort_order,
      section.is_required,
      section.is_repeatable,
      section.condition_json,
      case
        when section.section_key = 'seller_individual_capacity_pack' then (
          select coalesce(array_agg(key order by ordinality), array[]::text[])
          from unnest(coalesce(section.placeholder_keys, array[]::text[])) with ordinality as keys(key, ordinality)
          where key <> 'seller_spouse_consent_required'
        )
        else section.placeholder_keys
      end,
      case
        when section.section_key = 'seller_individual_capacity_pack' then btrim(regexp_replace(
          coalesce(section.legal_text, ''),
          E'\\n{1,3}Spouse Consent Required\\s*\\n\\{\\{\\s*seller_spouse_consent_required\\s*\\}\\}',
          '',
          'gi'
        ))
        else section.legal_text
      end,
      coalesce(section.metadata_json, '{}'::jsonb) || jsonb_build_object(
        'content_gate_repair_version', 'mandate-content-gate-v2'
      )
    from public.document_template_sections section
    where section.template_id = v_source_template.id
    order by section.sort_order, section.section_key;

    if to_regprocedure('public.bridge_build_template_definition_b1(uuid)') is not null then
      update public.document_packet_templates template
      set definition_json = public.bridge_build_template_definition_b1(template.id),
          updated_at = now()
      where template.id = v_template_id;
    end if;

    update public.document_packet_templates template
    set
      status = case when template.id = v_template_id then 'published' else 'archived' end,
      is_active = template.id = v_template_id,
      is_default = template.id = v_template_id,
      published_at = case when template.id = v_template_id then coalesce(template.published_at, now()) else template.published_at end,
      archived_at = case when template.id = v_template_id then null else coalesce(template.archived_at, now()) end,
      superseded_by_template_id = case when template.id = v_template_id then template.superseded_by_template_id else v_template_id end,
      updated_at = now()
    where template.organisation_id is null
      and lower(coalesce(template.module_type, '')) = 'agency'
      and lower(coalesce(template.packet_type, '')) = 'mandate'
      and template.template_key = 'mandate_default_v1';
  else
    v_template_id := v_source_template.id;
  end if;

  select count(*)
    into v_bad_pack_count
  from public.document_template_sections section
  where section.template_id = v_template_id
    and section.section_key = 'seller_individual_capacity_pack'
    and (
      coalesce(section.placeholder_keys, array[]::text[]) && array['seller_spouse_consent_required']::text[]
      or coalesce(section.legal_text, '') ~* '\{\{\s*seller_spouse_consent_required\s*\}\}'
      or coalesce(section.legal_text, '') ~* 'spouse consent required'
    );

  if v_bad_pack_count > 0 then
    raise exception 'Mandate spouse-pack corrective template still has spouse-consent wording in Individual Seller Capacity Pack.'
      using errcode = '23514';
  end if;

  select count(*)
    into v_active_default_count
  from public.document_packet_templates template
  where template.organisation_id is null
    and lower(coalesce(template.module_type, '')) = 'agency'
    and lower(coalesce(template.packet_type, '')) = 'mandate'
    and template.template_key = 'mandate_default_v1'
    and lower(coalesce(template.status, '')) = 'published'
    and template.is_active = true
    and template.is_default = true;

  if v_active_default_count <> 1 then
    raise exception 'Mandate spouse-pack corrective migration expected exactly one active published global default; found %.', v_active_default_count
      using errcode = '23514';
  end if;
end;
$$;

commit;
