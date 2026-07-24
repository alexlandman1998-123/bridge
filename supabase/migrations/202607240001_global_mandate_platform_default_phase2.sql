begin;

-- Phase 2 implements the platform-default product rule for mandates without
-- forging legal approval metadata. The selected global native mandate starter
-- becomes the single active/default platform mandate. B3 remains responsible
-- for independent legal approval and runtime release evidence.
do $$
declare
  v_template_id uuid;
  v_section_count integer;
  v_signature_count integer;
  v_bad_wording_count integer;
begin
  select candidate.id
    into v_template_id
  from (
    select
      template.id,
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
      and lower(coalesce(template.template_format, '')) in ('structured', 'json')
      and lower(coalesce(template.metadata_json->>'render_mode', template.metadata_json->>'renderMode', '')) = 'native_structured'
  ) candidate
  where candidate.rank = 1;

  if v_template_id is null then
    raise exception 'Phase 2 cannot promote a global native mandate starter because mandate_default_v1 is missing.'
      using errcode = '23514';
  end if;

  update public.document_packet_templates template
  set
    status = case
      when template.id = v_template_id then 'published'
      else 'archived'
    end,
    is_active = template.id = v_template_id,
    is_default = template.id = v_template_id,
    template_format = case
      when template.id = v_template_id then 'structured'
      else template.template_format
    end,
    template_storage_bucket = case
      when template.id = v_template_id then null
      else template.template_storage_bucket
    end,
    template_storage_path = case
      when template.id = v_template_id then null
      else template.template_storage_path
    end,
    template_file_name = case
      when template.id = v_template_id then null
      else template.template_file_name
    end,
    metadata_json = case
      when template.id = v_template_id then
        (
          coalesce(template.metadata_json, '{}'::jsonb)
            - 'template_storage_bucket' - 'template_bucket' - 'templateBucket'
            - 'template_storage_path' - 'templatePath'
            - 'template_file_name' - 'template_filename' - 'templateFilename'
        ) || jsonb_build_object(
          'template_scope', 'global_default',
          'platform_default_phase', 'phase2',
          'platform_default_document', true,
          'platform_default_can_route_without_org_template', true,
          'starter_template', coalesce(nullif(template.metadata_json->>'starter_template', ''), 'arch9_native_b2'),
          'starter_content_version', coalesce(nullif(template.metadata_json->>'starter_content_version', ''), 'b2-v1'),
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
        )
      else coalesce(template.metadata_json, '{}'::jsonb) || jsonb_build_object(
        'platform_default_superseded_by_template_id', v_template_id,
        'platform_default_superseded_at', now()
      )
    end,
    published_at = case
      when template.id = v_template_id then coalesce(template.published_at, now())
      else template.published_at
    end,
    archived_at = case
      when template.id = v_template_id then null
      else coalesce(template.archived_at, now())
    end,
    updated_at = now()
  where template.organisation_id is null
    and lower(coalesce(template.module_type, '')) = 'agency'
    and lower(coalesce(template.packet_type, '')) = 'mandate'
    and template.template_key = 'mandate_default_v1';

  select
    count(*),
    count(*) filter (where lower(coalesce(section.section_type, '')) = 'signature_zone'),
    count(*) filter (
      where nullif(btrim(coalesce(section.legal_text, '')), '') is null
         or section.legal_text ~* '(update this clause|lorem ipsum|todo|tbd|insert (clause|text)|placeholder copy)'
    )
    into v_section_count, v_signature_count, v_bad_wording_count
  from public.document_template_sections section
  where section.template_id = v_template_id;

  if v_section_count < 10 then
    raise exception 'Phase 2 global mandate starter requires at least 10 sections; found %.', v_section_count
      using errcode = '23514';
  end if;

  if v_signature_count < 1 then
    raise exception 'Phase 2 global mandate starter requires a visible signature section.'
      using errcode = '23514';
  end if;

  if v_bad_wording_count > 0 then
    raise exception 'Phase 2 global mandate starter contains empty or scaffold wording in % section(s).', v_bad_wording_count
      using errcode = '23514';
  end if;

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
    raise exception 'Phase 2 global mandate promotion left more than one active/default global mandate.'
      using errcode = '23514';
  end if;
end;
$$;

comment on table public.document_packet_templates is
  'Legal packet template registry. Platform default OTP/mandate templates are global rows with organisation_id null; agency-owned templates are optional overrides after approval.';

commit;
