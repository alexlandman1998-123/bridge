begin;

-- C1: instantiate a published immutable template revision as an independent,
-- editable transaction document draft in one database transaction.

alter table public.document_packet_versions
  add column if not exists source_template_revision_id uuid references public.document_packet_templates(id) on delete set null,
  add column if not exists editable_content_schema_version integer,
  add column if not exists editable_content_json jsonb not null default '{}'::jsonb,
  add column if not exists edit_status text not null default 'draft',
  add column if not exists edit_sequence integer not null default 0;

alter table public.document_packet_versions
  drop constraint if exists document_packet_versions_edit_status_c1_check;
alter table public.document_packet_versions
  add constraint document_packet_versions_edit_status_c1_check
  check (edit_status in ('draft', 'locked', 'superseded'));

alter table public.document_packet_versions
  drop constraint if exists document_packet_versions_edit_sequence_c1_check;
alter table public.document_packet_versions
  add constraint document_packet_versions_edit_sequence_c1_check check (edit_sequence >= 0);

create index if not exists document_packet_versions_template_revision_c1_idx
  on public.document_packet_versions (source_template_revision_id, created_at desc);

create or replace function public.bridge_create_editable_document_draft_c1(
  p_organisation_id uuid,
  p_packet_type text,
  p_title text,
  p_template_id uuid,
  p_transaction_id uuid default null,
  p_lead_id uuid default null,
  p_contact_id uuid default null,
  p_deal_id uuid default null,
  p_unit_id uuid default null,
  p_assigned_agent_id uuid default null,
  p_source_context_json jsonb default '{}'::jsonb,
  p_branding_snapshot_json jsonb default '{}'::jsonb,
  p_editable_content_json jsonb default '{}'::jsonb,
  p_section_manifest_json jsonb default '[]'::jsonb,
  p_placeholders_json jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_template public.document_packet_templates%rowtype;
  v_packet public.document_packets%rowtype;
  v_version public.document_packet_versions%rowtype;
  v_version_result jsonb;
  v_definition jsonb;
begin
  if auth.role() <> 'service_role' and v_actor is null then
    raise exception 'Authenticated document author is required.' using errcode = '42501';
  end if;
  if auth.role() <> 'service_role' and not (
    public.bridge_is_active_member(p_organisation_id)
    or public.bridge_is_org_admin(p_organisation_id)
  ) then
    raise exception 'Active organisation membership is required.' using errcode = '42501';
  end if;

  select * into v_template
  from public.document_packet_templates
  where id = p_template_id;
  if not found then
    raise exception 'Template revision not found.' using errcode = 'P0002';
  end if;
  if v_template.organisation_id is not null and v_template.organisation_id <> p_organisation_id then
    raise exception 'Template revision belongs to another organisation.' using errcode = '42501';
  end if;
  if v_template.status <> 'published' or not coalesce(v_template.is_active, false) then
    raise exception 'Publish the template before creating a transaction document.';
  end if;
  if v_template.packet_type <> lower(trim(p_packet_type)) then
    raise exception 'Template and packet document types do not match.';
  end if;
  if v_template.template_format not in ('structured', 'json') then
    raise exception 'An editable transaction document requires a native structured template.';
  end if;

  v_definition := coalesce(v_template.definition_json, '{}'::jsonb);
  if v_definition = '{}'::jsonb or coalesce(jsonb_array_length(v_definition->'sections'), 0) = 0 then
    raise exception 'Template definition has no editable sections.';
  end if;
  if coalesce(p_editable_content_json, '{}'::jsonb) = '{}'::jsonb
     or coalesce(jsonb_array_length(p_editable_content_json->'sections'), 0) = 0 then
    raise exception 'Editable document content has no sections.';
  end if;

  insert into public.document_packets (
    organisation_id, packet_type, title, status, template_id,
    template_key_snapshot, template_label_snapshot,
    transaction_id, lead_id, contact_id, deal_id, unit_id,
    assigned_agent_id, created_by, source_context_json, branding_snapshot_json
  ) values (
    p_organisation_id, lower(trim(p_packet_type)), nullif(trim(p_title), ''), 'draft', v_template.id,
    v_template.template_key, v_template.template_label,
    p_transaction_id, p_lead_id, p_contact_id, p_deal_id, p_unit_id,
    coalesce(p_assigned_agent_id, v_actor), v_actor,
    coalesce(p_source_context_json, '{}'::jsonb) || jsonb_build_object(
      'templateId', v_template.id,
      'templateVersion', v_template.version_tag,
      'editableDraftSchemaVersion', coalesce((p_editable_content_json->>'schemaVersion')::integer, 1),
      'createdFromPublishedTemplate', true
    ),
    coalesce(p_branding_snapshot_json, '{}'::jsonb)
  ) returning * into v_packet;

  select public.bridge_create_document_packet_version_i1(
    p_packet_id => v_packet.id,
    p_render_status => 'draft',
    p_placeholders_resolved_json => coalesce(p_placeholders_json, '{}'::jsonb),
    p_placeholders_missing_json => '[]'::jsonb,
    p_section_manifest_json => coalesce(p_section_manifest_json, '[]'::jsonb),
    p_validation_summary_json => jsonb_build_object(
      'contract', 'c1-v1',
      'editableDraft', true,
      'templateRevisionId', v_template.id,
      'templateVersionTag', v_template.version_tag,
      'generationStatus', 'not_generated'
    ),
    p_generated_by => v_actor,
    p_generated_at => now(),
    p_dry_run => false
  ) into v_version_result;

  if v_version_result->>'contract' <> 'i1-v1' or coalesce((v_version_result->>'dryRun')::boolean, true) then
    raise exception 'Packet version creation returned an invalid result.';
  end if;

  update public.document_packet_versions
  set
    source_template_revision_id = v_template.id,
    editable_content_schema_version = coalesce((p_editable_content_json->>'schemaVersion')::integer, 1),
    editable_content_json = jsonb_set(
      coalesce(p_editable_content_json, '{}'::jsonb),
      '{documentId}',
      to_jsonb(v_packet.id),
      true
    ),
    edit_status = 'draft',
    edit_sequence = 0
  where id = (v_version_result#>>'{version,id}')::uuid
  returning * into v_version;

  if v_version.id is null then
    raise exception 'Editable packet version was not persisted.';
  end if;

  insert into public.document_packet_events (
    packet_id, organisation_id, version_id, event_type, event_payload_json, created_by
  ) values (
    v_packet.id, p_organisation_id, v_version.id, 'editable_draft_created',
    jsonb_build_object(
      'contract', 'c1-v1',
      'templateRevisionId', v_template.id,
      'templateVersionTag', v_template.version_tag,
      'sectionCount', jsonb_array_length(v_version.editable_content_json->'sections')
    ),
    v_actor
  );

  select * into v_packet from public.document_packets where id = v_packet.id;

  return jsonb_build_object(
    'contract', 'c1-v1',
    'packet', to_jsonb(v_packet),
    'version', to_jsonb(v_version),
    'editableContent', v_version.editable_content_json
  );
end;
$$;

revoke all on function public.bridge_create_editable_document_draft_c1(
  uuid, text, text, uuid, uuid, uuid, uuid, uuid, uuid, uuid, jsonb, jsonb, jsonb, jsonb, jsonb
) from public, anon;
grant execute on function public.bridge_create_editable_document_draft_c1(
  uuid, text, text, uuid, uuid, uuid, uuid, uuid, uuid, uuid, jsonb, jsonb, jsonb, jsonb, jsonb
) to authenticated, service_role;

comment on column public.document_packet_versions.editable_content_json is
  'C1 independent editable transaction-document content copied from an immutable published template revision.';

commit;
