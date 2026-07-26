begin;

-- Corrective migration for the mandate content gate.
-- The app now normalises legacy Arch9/default mandate drafts on load. This
-- migration repairs the production source of truth so new agency copies start
-- clean and non-published default mandate drafts no longer carry universal
-- Property Details wording that belongs in conditional packs.

do $$
declare
  v_source_template public.document_packet_templates%rowtype;
  v_template_id uuid;
  v_root_template_id uuid;
  v_revision_number integer;
  v_version_tag text;
  v_existing_repair_template_id uuid;
  v_needs_global_repair boolean := false;
  v_section_count integer;
  v_signature_count integer;
  v_bad_property_count integer;
  v_unconditioned_pack_count integer;
  v_route_specific_keys text[] := array[
    'erf_number',
    'erf_size',
    'floor_size',
    'property_unit_number',
    'property_section_number',
    'sectional_title_number',
    'property_complex_name',
    'property_estate_name'
  ];
begin
  select candidate.*
    into v_source_template
  from (
    select
      template.*,
      row_number() over (
        order by
          case when lower(coalesce(template.status, '')) = 'published' then 0 else 1 end,
          case when template.is_active then 0 else 1 end,
          case when template.is_default then 0 else 1 end,
          template.revision_number desc nulls last,
          template.updated_at desc nulls last,
          template.created_at desc nulls last,
          template.id
      ) as rank
    from public.document_packet_templates template
    where template.organisation_id is null
      and lower(coalesce(template.module_type, '')) = 'agency'
      and lower(coalesce(template.packet_type, '')) = 'mandate'
      and template.template_key = 'mandate_default_v1'
      and lower(coalesce(template.status, '')) <> 'archived'
  ) candidate
  where candidate.rank = 1;

  if v_source_template.id is null then
    raise exception 'Mandate content-gate corrective migration requires a global mandate_default_v1 template.'
      using errcode = '23514';
  end if;

  select exists (
    select 1
    from public.document_template_sections section
    where section.template_id = v_source_template.id
      and (
        (
          section.section_key = 'property_details'
          and (
            coalesce(section.placeholder_keys, array[]::text[]) && v_route_specific_keys
            or coalesce(section.legal_text, '') ~* '\{\{\s*(erf_number|erf_size|floor_size|property_unit_number|property_section_number|sectional_title_number|property_complex_name|property_estate_name)\s*\}\}'
          )
        )
        or (
          section.section_key in (
            'seller_individual_capacity_pack',
            'seller_company_authority_pack',
            'seller_trust_authority_pack',
            'seller_spouse_consent_pack',
            'property_full_title_pack',
            'property_sectional_title_pack'
          )
          and coalesce(section.condition_json, '{}'::jsonb) = '{}'::jsonb
        )
      )
  ) into v_needs_global_repair;

  select template.id
    into v_existing_repair_template_id
  from public.document_packet_templates template
  where template.organisation_id is null
    and lower(coalesce(template.module_type, '')) = 'agency'
    and lower(coalesce(template.packet_type, '')) = 'mandate'
    and template.template_key = 'mandate_default_v1'
    and coalesce(template.metadata_json->>'content_gate_repair_version', '') = 'mandate-content-gate-v1'
  order by template.updated_at desc nulls last, template.created_at desc nulls last
  limit 1;

  if v_needs_global_repair then
    if v_existing_repair_template_id is not null then
      v_template_id := v_existing_repair_template_id;
    else
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
        ) || jsonb_build_object(
          'template_scope', 'global_default',
          'content_gate_repair_version', 'mandate-content-gate-v1',
          'content_gate_repair_applied_at', now(),
          'render_mode', 'native_structured',
          'native_template', true,
          'mandate_template_variant', 'default',
          'mandateTemplateVariant', 'default'
        ),
        v_source_template.created_by,
        v_source_template.updated_by,
        v_source_template.published_by,
        null,
        'draft',
        v_source_template.content_hash,
        'Corrective mandate content-gate revision: move route-specific property wording into conditional packs and restore pack visibility conditions.',
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
        case
          when section.section_key = 'seller_individual_capacity_pack' and coalesce(section.condition_json, '{}'::jsonb) = '{}'::jsonb
            then jsonb_build_object('enabled', true, 'rule', jsonb_build_object('field', 'seller_entity_type', 'operator', 'equals', 'value', 'individual'), 'label', 'Only include for individual sellers')
          when section.section_key = 'seller_company_authority_pack' and coalesce(section.condition_json, '{}'::jsonb) = '{}'::jsonb
            then jsonb_build_object('enabled', true, 'rule', jsonb_build_object('field', 'seller_entity_type', 'operator', 'in', 'value', jsonb_build_array('company', 'close_corporation')), 'label', 'Only include for company or close corporation sellers')
          when section.section_key = 'seller_trust_authority_pack' and coalesce(section.condition_json, '{}'::jsonb) = '{}'::jsonb
            then jsonb_build_object('enabled', true, 'rule', jsonb_build_object('field', 'seller_entity_type', 'operator', 'equals', 'value', 'trust'), 'label', 'Only include for trust sellers')
          when section.section_key = 'seller_spouse_consent_pack' and coalesce(section.condition_json, '{}'::jsonb) = '{}'::jsonb
            then jsonb_build_object('enabled', true, 'rule', jsonb_build_object('field', 'seller_spouse_consent_required', 'operator', 'equals', 'value', 'Yes'), 'label', 'Only include when seller spouse consent is required')
          when section.section_key = 'property_full_title_pack' and coalesce(section.condition_json, '{}'::jsonb) = '{}'::jsonb
            then jsonb_build_object('enabled', true, 'rule', jsonb_build_object('field', 'property_title_type', 'operator', 'in', 'value', jsonb_build_array('full_title', 'agricultural_holding')), 'label', 'Only include for full title properties')
          when section.section_key = 'property_sectional_title_pack' and coalesce(section.condition_json, '{}'::jsonb) = '{}'::jsonb
            then jsonb_build_object('enabled', true, 'rule', jsonb_build_object('field', 'property_title_type', 'operator', 'in', 'value', jsonb_build_array('sectional_title', 'share_block')), 'label', 'Only include for sectional title or share block properties')
          else section.condition_json
        end,
        case
          when section.section_key = 'property_details' then (
            select coalesce(array_agg(key order by ordinality), array[]::text[])
            from unnest(coalesce(section.placeholder_keys, array[]::text[])) with ordinality as keys(key, ordinality)
            where not (key = any(v_route_specific_keys))
          )
          else section.placeholder_keys
        end,
        case
          when section.section_key = 'property_details' then btrim(regexp_replace(
            coalesce(section.legal_text, ''),
            E'(^|\\n)[^\\n]*\\{\\{\\s*(erf_number|erf_size|floor_size|property_unit_number|property_section_number|sectional_title_number|property_complex_name|property_estate_name)\\s*\\}\\}[^\\n]*(?=\\n|$)',
            '',
            'gi'
          ))
          else section.legal_text
        end,
        coalesce(section.metadata_json, '{}'::jsonb) || jsonb_build_object(
          'content_gate_repair_version', 'mandate-content-gate-v1'
        )
      from public.document_template_sections section
      where section.template_id = v_source_template.id
      order by section.sort_order, section.section_key
      on conflict (template_id, section_key) do nothing;

      if to_regprocedure('public.bridge_build_template_definition_b1(uuid)') is not null then
        update public.document_packet_templates template
        set definition_json = public.bridge_build_template_definition_b1(template.id),
            updated_at = now()
        where template.id = v_template_id;
      end if;

      update public.document_packet_templates
      set
        status = 'published',
        is_active = true,
        is_default = true,
        published_at = coalesce(published_at, now()),
        updated_at = now()
      where id = v_template_id;
    end if;

    update public.document_packet_templates template
    set
      status = case when template.id = v_template_id then 'published' else 'archived' end,
      is_active = template.id = v_template_id,
      is_default = template.id = v_template_id,
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

  -- Repair non-published default mandate drafts directly. Published
  -- organisation revisions stay immutable; the application creates a clean
  -- successor draft when they are opened for editing.
  update public.document_template_sections section
  set
    placeholder_keys = (
      select coalesce(array_agg(key order by ordinality), array[]::text[])
      from unnest(coalesce(section.placeholder_keys, array[]::text[])) with ordinality as keys(key, ordinality)
      where not (key = any(v_route_specific_keys))
    ),
    legal_text = btrim(regexp_replace(
      coalesce(section.legal_text, ''),
      E'(^|\\n)[^\\n]*\\{\\{\\s*(erf_number|erf_size|floor_size|property_unit_number|property_section_number|sectional_title_number|property_complex_name|property_estate_name)\\s*\\}\\}[^\\n]*(?=\\n|$)',
      '',
      'gi'
    )),
    metadata_json = coalesce(section.metadata_json, '{}'::jsonb) || jsonb_build_object(
      'content_gate_repair_version', 'mandate-content-gate-v1'
    ),
    updated_at = now()
  from public.document_packet_templates template
  where section.template_id = template.id
    and section.section_key = 'property_details'
    and lower(coalesce(template.packet_type, '')) = 'mandate'
    and lower(coalesce(template.status, '')) not in ('published', 'archived')
    and lower(coalesce(template.metadata_json->>'mandate_template_variant', template.metadata_json->>'mandateTemplateVariant', 'default')) = 'default';

  update public.document_template_sections section
  set
    condition_json = case section.section_key
      when 'seller_individual_capacity_pack'
        then jsonb_build_object('enabled', true, 'rule', jsonb_build_object('field', 'seller_entity_type', 'operator', 'equals', 'value', 'individual'), 'label', 'Only include for individual sellers')
      when 'seller_company_authority_pack'
        then jsonb_build_object('enabled', true, 'rule', jsonb_build_object('field', 'seller_entity_type', 'operator', 'in', 'value', jsonb_build_array('company', 'close_corporation')), 'label', 'Only include for company or close corporation sellers')
      when 'seller_trust_authority_pack'
        then jsonb_build_object('enabled', true, 'rule', jsonb_build_object('field', 'seller_entity_type', 'operator', 'equals', 'value', 'trust'), 'label', 'Only include for trust sellers')
      when 'seller_spouse_consent_pack'
        then jsonb_build_object('enabled', true, 'rule', jsonb_build_object('field', 'seller_spouse_consent_required', 'operator', 'equals', 'value', 'Yes'), 'label', 'Only include when seller spouse consent is required')
      when 'property_full_title_pack'
        then jsonb_build_object('enabled', true, 'rule', jsonb_build_object('field', 'property_title_type', 'operator', 'in', 'value', jsonb_build_array('full_title', 'agricultural_holding')), 'label', 'Only include for full title properties')
      when 'property_sectional_title_pack'
        then jsonb_build_object('enabled', true, 'rule', jsonb_build_object('field', 'property_title_type', 'operator', 'in', 'value', jsonb_build_array('sectional_title', 'share_block')), 'label', 'Only include for sectional title or share block properties')
      else section.condition_json
    end,
    metadata_json = coalesce(section.metadata_json, '{}'::jsonb) || jsonb_build_object(
      'content_gate_repair_version', 'mandate-content-gate-v1'
    ),
    updated_at = now()
  from public.document_packet_templates template
  where section.template_id = template.id
    and section.section_key in (
      'seller_individual_capacity_pack',
      'seller_company_authority_pack',
      'seller_trust_authority_pack',
      'seller_spouse_consent_pack',
      'property_full_title_pack',
      'property_sectional_title_pack'
    )
    and coalesce(section.condition_json, '{}'::jsonb) = '{}'::jsonb
    and lower(coalesce(template.packet_type, '')) = 'mandate'
    and lower(coalesce(template.status, '')) not in ('published', 'archived')
    and lower(coalesce(template.metadata_json->>'mandate_template_variant', template.metadata_json->>'mandateTemplateVariant', 'default')) = 'default';

  select
    count(*),
    count(*) filter (where lower(coalesce(section.section_type, '')) = 'signature_zone'),
    count(*) filter (
      where section.section_key = 'property_details'
        and (
          coalesce(section.placeholder_keys, array[]::text[]) && v_route_specific_keys
          or coalesce(section.legal_text, '') ~* '\{\{\s*(erf_number|erf_size|floor_size|property_unit_number|property_section_number|sectional_title_number|property_complex_name|property_estate_name)\s*\}\}'
        )
    ),
    count(*) filter (
      where section.section_key in (
        'seller_individual_capacity_pack',
        'seller_company_authority_pack',
        'seller_trust_authority_pack',
        'seller_spouse_consent_pack',
        'property_full_title_pack',
        'property_sectional_title_pack'
      )
      and coalesce(section.condition_json, '{}'::jsonb) = '{}'::jsonb
    )
    into v_section_count, v_signature_count, v_bad_property_count, v_unconditioned_pack_count
  from public.document_template_sections section
  where section.template_id = v_template_id;

  if v_section_count < 10 then
    raise exception 'Mandate content-gate corrective global template requires at least 10 sections; found %.', v_section_count
      using errcode = '23514';
  end if;

  if v_signature_count < 1 then
    raise exception 'Mandate content-gate corrective global template requires a signature section.'
      using errcode = '23514';
  end if;

  if v_bad_property_count > 0 then
    raise exception 'Mandate content-gate corrective global template still has route-specific Property Details wording.'
      using errcode = '23514';
  end if;

  if v_unconditioned_pack_count > 0 then
    raise exception 'Mandate content-gate corrective global template still has unconditioned conditional packs.'
      using errcode = '23514';
  end if;
end;
$$;

commit;
