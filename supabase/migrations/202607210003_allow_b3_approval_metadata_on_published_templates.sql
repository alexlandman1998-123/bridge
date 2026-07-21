begin;

create or replace function public.bridge_guard_published_template_revision_b4()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_b3_metadata_keys text[] := array[
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
    'legal_revoked_at',
    'legal_revocation_reason',
    'legal_approval_history'
  ];
begin
  if old.status = 'archived' and new.status is distinct from old.status then
    raise exception 'Archived template revisions are immutable. Create a new draft revision.'
      using errcode = '55000';
  end if;

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
      old.status = 'archived'
      and new.metadata_json is distinct from old.metadata_json
    )
    or (
      old.status = 'published'
      and (coalesce(new.metadata_json, '{}'::jsonb) - v_b3_metadata_keys)
        is distinct from (coalesce(old.metadata_json, '{}'::jsonb) - v_b3_metadata_keys)
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

comment on function public.bridge_guard_published_template_revision_b4() is
  'B4 immutability guard. Published template content remains immutable, while B3 may stamp audited legal approval metadata keys.';

commit;
