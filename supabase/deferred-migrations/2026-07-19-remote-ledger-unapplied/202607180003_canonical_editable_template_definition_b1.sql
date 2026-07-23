begin;

-- B1 makes JSON the portable, authoritative template contract while retaining
-- the existing relational section rows for querying and backwards compatibility.
alter table public.document_packet_templates
  add column if not exists definition_schema_version integer not null default 1,
  add column if not exists definition_json jsonb not null default '{}'::jsonb;

alter table public.document_packet_template_versions
  add column if not exists definition_schema_version integer not null default 1,
  add column if not exists definition_json jsonb not null default '{}'::jsonb;

alter table public.document_packet_templates
  drop constraint if exists document_packet_templates_definition_b1_check;
alter table public.document_packet_templates
  add constraint document_packet_templates_definition_b1_check
  check (
    definition_schema_version = 1
    and jsonb_typeof(definition_json) = 'object'
  );

alter table public.document_packet_template_versions
  drop constraint if exists document_packet_template_versions_definition_b1_check;
alter table public.document_packet_template_versions
  add constraint document_packet_template_versions_definition_b1_check
  check (
    definition_schema_version = 1
    and jsonb_typeof(definition_json) = 'object'
  );

create or replace function public.bridge_build_template_definition_b1(p_template_id uuid)
returns jsonb
language sql
stable
set search_path = public
as $$
  with template as (
    select t.*
    from public.document_packet_templates t
    where t.id = p_template_id
  ), section_rows as (
    select
      s.*,
      row_number() over (order by s.sort_order, s.created_at, s.id) - 1 as canonical_order
    from public.document_template_sections s
    where s.template_id = p_template_id
  ), sections as (
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'key', s.section_key,
        'label', s.section_label,
        'type', s.section_type,
        'order', s.canonical_order,
        'editable', case when lower(coalesce(s.metadata_json->>'editable', 'true')) in ('false', '0', 'no') then false else true end,
        'required', s.is_required,
        'repeatable', s.is_repeatable,
        'content', coalesce(s.legal_text, ''),
        'mergeFields', coalesce((
          select jsonb_agg(jsonb_build_object(
            'key', field_key,
            'label', initcap(replace(field_key, '_', ' ')),
            'valueType', 'text',
            'required', false
          ) order by field_key)
          from unnest(coalesce(s.placeholder_keys, '{}'::text[])) field_key
        ), '[]'::jsonb),
        'condition', coalesce(s.condition_json, '{}'::jsonb),
        'signingFields', coalesce(
          s.metadata_json->'signing'->'signing_fields',
          s.metadata_json->'signing'->'planned_fields',
          s.metadata_json->'planned_signing_fields',
          '[]'::jsonb
        ),
        'metadata', coalesce(s.metadata_json, '{}'::jsonb)
      ) order by s.canonical_order
    ), '[]'::jsonb) as value
    from section_rows s
  ), merge_fields as (
    select coalesce(jsonb_agg(field_key order by field_key), '[]'::jsonb) as value
    from (
      select distinct unnest(coalesce(s.placeholder_keys, '{}'::text[])) as field_key
      from section_rows s
    ) fields
  )
  select jsonb_build_object(
    'schemaVersion', 1,
    'templateId', t.id,
    'templateKey', t.template_key,
    'name', t.template_label,
    'documentType', t.packet_type,
    'moduleType', t.module_type,
    'organisationId', t.organisation_id,
    'version', jsonb_build_object(
      'tag', coalesce(nullif(t.version_tag, ''), 'v1'),
      'number', case when coalesce(t.version_tag, '') ~ '[0-9]+' then substring(t.version_tag from '[0-9]+')::integer else 1 end
    ),
    'status', case
      when t.status = 'published' then 'active'
      when t.status in ('draft', 'archived') then t.status
      when coalesce(t.is_active, true) then 'active'
      else 'archived'
    end,
    'sourceMode', case when t.template_format in ('structured', 'json') then 'native' else 'legacy_docx' end,
    'sections', sections.value,
    'mergeFields', merge_fields.value,
    'defaultSignerRoles', coalesce(
      t.metadata_json->'default_signer_roles',
      t.metadata_json->'defaultSignerRoles',
      '[]'::jsonb
    ),
    'branding', jsonb_build_object(
      'inheritOrganisationBranding', case when lower(coalesce(t.metadata_json->>'inherit_organisation_branding', 'true')) in ('false', '0', 'no') then false else true end
    ) || coalesce(
      t.metadata_json->'branding',
      t.metadata_json->'branding_defaults',
      t.metadata_json->'company_branding',
      '{}'::jsonb
    )
  )
  from template t
  cross join sections
  cross join merge_fields;
$$;

create or replace function public.bridge_sync_template_definition_b1()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_template_id uuid;
begin
  v_template_id := case when tg_op = 'DELETE' then old.id else new.id end;
  update public.document_packet_templates
  set
    definition_schema_version = 1,
    definition_json = public.bridge_build_template_definition_b1(v_template_id)
  where id = v_template_id
    and packet_type in ('mandate', 'otp', 'addendum');
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function public.bridge_sync_template_section_definition_b1()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_template_id uuid;
begin
  v_template_id := case when tg_op = 'DELETE' then old.template_id else new.template_id end;
  update public.document_packet_templates
  set
    definition_schema_version = 1,
    definition_json = public.bridge_build_template_definition_b1(v_template_id)
  where id = v_template_id
    and packet_type in ('mandate', 'otp', 'addendum');
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_template_definition_b1 on public.document_packet_templates;
create trigger trg_sync_template_definition_b1
after insert or update of
  template_key, template_label, packet_type, module_type, organisation_id,
  version_tag, status, is_active, template_format, metadata_json
on public.document_packet_templates
for each row execute function public.bridge_sync_template_definition_b1();

drop trigger if exists trg_sync_template_section_definition_b1 on public.document_template_sections;
create trigger trg_sync_template_section_definition_b1
after insert or update or delete on public.document_template_sections
for each row execute function public.bridge_sync_template_section_definition_b1();

update public.document_packet_templates t
set
  definition_schema_version = 1,
  definition_json = public.bridge_build_template_definition_b1(t.id)
where t.packet_type in ('mandate', 'otp', 'addendum');

update public.document_packet_template_versions v
set
  definition_schema_version = 1,
  definition_json = jsonb_build_object(
    'schemaVersion', 1,
    'templateId', v.template_id,
    'templateVersionId', v.id,
    'templateKey', v.template_key,
    'name', v.template_label,
    'documentType', v.packet_type,
    'moduleType', v.module_type,
    'organisationId', v.organisation_id,
    'version', jsonb_build_object(
      'tag', v.version_tag,
      'number', case when coalesce(v.version_tag, '') ~ '[0-9]+' then substring(v.version_tag from '[0-9]+')::integer else 1 end
    ),
    'status', case when v.status in ('superseded', 'archived') then 'archived' when v.status = 'published' then 'active' else 'draft' end,
    'sourceMode', case when v.template_format in ('structured', 'json') then 'native' else 'legacy_docx' end,
    'sections', coalesce(v.sections_snapshot_json, '[]'::jsonb),
    'mergeFields', to_jsonb(coalesce(v.placeholder_keys, '{}'::text[])),
    'defaultSignerRoles', coalesce(v.metadata_json->'default_signer_roles', v.metadata_json->'defaultSignerRoles', '[]'::jsonb),
    'branding', coalesce(v.metadata_json->'branding', v.metadata_json->'branding_defaults', '{}'::jsonb)
  )
where v.packet_type in ('mandate', 'otp', 'addendum');

comment on column public.document_packet_templates.definition_json is
  'B1 canonical editable template definition: identity, ordered clauses, merge fields, conditions, signer roles, branding, ownership, version and lifecycle.';

commit;
