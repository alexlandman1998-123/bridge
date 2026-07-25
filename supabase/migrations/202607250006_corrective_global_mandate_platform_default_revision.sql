begin;

-- Corrective migration for 202607240002.
-- The original data migration attempted to mutate a published mandate
-- template revision. Published legal template revisions are immutable, so this
-- promotes a new global mandate default revision instead.

do $$
declare
  v_source_template public.document_packet_templates%rowtype;
  v_template_id uuid;
  v_root_template_id uuid;
  v_revision_number integer;
  v_version_tag text;
  v_section_count integer;
  v_signature_count integer;
  v_bad_wording_count integer;
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
          (
            select count(*)
            from public.document_template_sections section
            where section.template_id = template.id
          ) desc,
          template.updated_at desc nulls last,
          template.created_at desc nulls last,
          template.id
      ) as rank
    from public.document_packet_templates template
    where template.organisation_id is null
      and lower(coalesce(template.module_type, '')) = 'agency'
      and lower(coalesce(template.packet_type, '')) = 'mandate'
      and template.template_key = 'mandate_default_v1'
      and lower(coalesce(template.template_format, '')) in ('structured', 'json', 'html')
      and lower(coalesce(template.metadata_json->>'render_mode', template.metadata_json->>'renderMode', '')) = 'native_structured'
      and lower(coalesce(template.status, '')) <> 'archived'
  ) candidate
  where candidate.rank = 1;

  if v_source_template.id is null then
    raise exception 'Corrective Phase 2 cannot promote a global native mandate starter because mandate_default_v1 is missing.'
      using errcode = '23514';
  end if;

  select
    count(*),
    count(*) filter (where lower(coalesce(section.section_type, '')) = 'signature_zone'),
    count(*) filter (
      where nullif(btrim(coalesce(section.legal_text, '')), '') is null
         or section.legal_text ~* '(update this clause|lorem ipsum|todo|tbd|insert (clause|text)|placeholder copy)'
    )
    into v_section_count, v_signature_count, v_bad_wording_count
  from public.document_template_sections section
  where section.template_id = v_source_template.id;

  if v_section_count < 10 then
    raise exception 'Corrective Phase 2 global mandate starter requires at least 10 sections; found %.', v_section_count
      using errcode = '23514';
  end if;

  if v_signature_count < 1 then
    raise exception 'Corrective Phase 2 global mandate starter requires a visible signature section.'
      using errcode = '23514';
  end if;

  if v_bad_wording_count > 0 then
    raise exception 'Corrective Phase 2 global mandate starter contains empty or scaffold wording in % section(s).', v_bad_wording_count
      using errcode = '23514';
  end if;

  select template.id
    into v_template_id
  from public.document_packet_templates template
  where template.organisation_id is null
    and lower(coalesce(template.module_type, '')) = 'agency'
    and lower(coalesce(template.packet_type, '')) = 'mandate'
    and template.template_key = 'mandate_default_v1'
    and lower(coalesce(template.status, '')) = 'published'
    and template.is_active
    and template.is_default
    and coalesce(template.metadata_json->>'platform_default_phase', '') = 'phase2'
    and coalesce((template.metadata_json->>'platform_default_document')::boolean, false)
  order by template.updated_at desc nulls last, template.created_at desc nulls last
  limit 1;

  if v_template_id is null then
    v_root_template_id := coalesce(v_source_template.revision_root_template_id, v_source_template.id);
    select coalesce(max(template.revision_number), 0) + 1
      into v_revision_number
    from public.document_packet_templates template
    where coalesce(template.revision_root_template_id, template.id) = v_root_template_id;
    v_version_tag := 'phase2-v' || v_revision_number::text;

    while exists (
      select 1
      from public.document_packet_templates template
      where template.organisation_id is null
        and template.template_key = 'mandate_default_v1'
        and template.version_tag = v_version_tag
    ) loop
      v_revision_number := v_revision_number + 1;
      v_version_tag := 'phase2-v' || v_revision_number::text;
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
        'platform_default_phase', 'phase2',
        'platform_default_document', true,
        'platform_default_can_route_without_org_template', true,
        'starter_template', coalesce(nullif(v_source_template.metadata_json->>'starter_template', ''), 'arch9_native_b2'),
        'starter_content_version', coalesce(nullif(v_source_template.metadata_json->>'starter_content_version', ''), 'b2-v1'),
        'render_mode', 'native_structured',
        'native_template', true,
        'inherit_organisation_branding', true,
        'legal_runtime_release_required', true,
        'default_signer_roles', jsonb_build_array(
          jsonb_build_object('role', 'seller', 'label', 'Seller', 'required', true, 'order', 0),
          jsonb_build_object('role', 'agent', 'label', 'Estate Agent', 'required', true, 'order', 1),
          jsonb_build_object('role', 'seller_spouse', 'label', 'Seller spouse / co-signer', 'required', false, 'order', 2),
          jsonb_build_object('role', 'witness', 'label', 'Witness', 'required', false, 'order', 3)
        ),
        'branding', jsonb_build_object('inheritOrganisationBranding', true)
      ),
      v_source_template.created_by,
      v_source_template.updated_by,
      v_source_template.published_by,
      null,
      'draft',
      v_source_template.content_hash,
      'Corrective Phase 2 platform default mandate revision promoted without mutating a published source revision.',
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
      section.placeholder_keys,
      section.legal_text,
      section.metadata_json
    from public.document_template_sections section
    where section.template_id = v_source_template.id
    order by section.sort_order, section.section_key
    on conflict (template_id, section_key) do nothing;

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

  if exists (
    select 1
    from public.document_packet_templates template
    where template.organisation_id is null
      and lower(coalesce(template.module_type, '')) = 'agency'
      and lower(coalesce(template.packet_type, '')) = 'mandate'
      and template.template_key = 'mandate_default_v1'
      and lower(coalesce(template.status, '')) = 'published'
      and template.is_active
      and template.is_default
      and template.id <> v_template_id
  ) then
    raise exception 'Corrective Phase 2 global mandate promotion left more than one active/default global mandate.'
      using errcode = '23514';
  end if;
end;
$$;

comment on table public.document_packet_templates is
  'Legal packet template registry. Platform default OTP/mandate templates are global rows with organisation_id null; agency-owned templates are optional overrides after approval.';

commit;
