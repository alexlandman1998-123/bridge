do $$
begin
  perform set_config('request.jwt.claims', '{"app_metadata":{"role":"developer"}}', true);
  if public.bridge_is_platform_admin() then
    raise exception 'Generic developer app metadata must not grant platform-admin access.';
  end if;

  perform set_config('request.jwt.claims', '{"user_metadata":{"role":"founder"}}', true);
  if public.bridge_is_platform_admin() then
    raise exception 'User-editable metadata must not grant platform-admin access.';
  end if;

  perform set_config('request.jwt.claims', '{"app_metadata":{"role":"executive"}}', true);
  if not public.bridge_is_platform_admin() then
    raise exception 'Trusted executive app metadata should grant platform-admin access.';
  end if;
end;
$$;

do $$
declare
  v_expected_versions bigint;
begin
  select count(*) into v_expected_versions
  from public.document_packet_templates template
  where template.organisation_id is null
     or exists (select 1 from public.organisations organisation where organisation.id = template.organisation_id);

  if (select count(*) from public.document_packet_template_versions) <> v_expected_versions then
    raise exception 'Template version snapshot does not match the valid/global template population.';
  end if;
  if exists (
    select 1
    from public.document_packet_template_versions version
    left join public.organisations organisation on organisation.id = version.organisation_id
    where version.organisation_id is not null and organisation.id is null
  ) then
    raise exception 'An orphaned organisation id entered the template version registry.';
  end if;
  if (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'legal_templates%') <> 8 then
    raise exception 'Expected eight legal-template storage policies.';
  end if;
  if not coalesce((select not public from storage.buckets where id = 'legal-templates'), false) then
    raise exception 'The legal-template storage bucket must exist and remain private.';
  end if;
  if has_function_privilege('anon', 'public.bridge_is_platform_admin()', 'EXECUTE')
    or has_function_privilege('anon', 'public.bridge_is_legal_template_storage_path(text)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.bridge_document_packet_template_audit()', 'EXECUTE')
  then
    raise exception 'Internal canonical-template helpers expose excess execute privileges.';
  end if;
end;
$$;

select jsonb_build_object(
  'template_registry_columns', (
    select count(*)
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'document_packet_templates'
      and column_name in (
        'status', 'template_storage_bucket', 'template_file_name', 'content_hash',
        'change_summary', 'updated_by', 'published_by', 'published_at',
        'archived_by', 'archived_at'
      )
  ),
  'registry_tables_with_rls', (
    select count(*)
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in ('document_packet_template_versions', 'document_packet_template_audit')
      and c.relrowsecurity
  ),
  'registry_indexes', (
    select count(*) from pg_indexes
    where schemaname = 'public'
      and indexname in (
        'document_packet_templates_registry_lookup_idx',
        'document_packet_templates_published_idx',
        'document_packet_template_versions_template_created_idx',
        'document_packet_template_versions_org_lookup_idx',
        'document_packet_template_versions_published_idx',
        'document_packet_template_audit_template_created_idx',
        'document_packet_template_audit_org_created_idx'
      )
  ),
  'registry_triggers', (
    select count(*)
    from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and t.tgname in (
        'document_packet_template_versions_set_updated_at',
        'document_packet_templates_audit',
        'document_packet_template_versions_audit'
      )
      and not t.tgisinternal
  ),
  'registry_policies', (
    select count(*) from pg_policies
    where schemaname = 'public'
      and tablename in ('document_packet_templates', 'document_packet_template_versions', 'document_packet_template_audit')
      and policyname in (
        'document_packet_templates_select', 'document_packet_templates_write',
        'document_packet_template_versions_select', 'document_packet_template_versions_write',
        'document_packet_template_audit_select', 'document_packet_template_audit_insert',
        'document_packet_templates_platform_admin_select', 'document_packet_templates_platform_admin_write',
        'document_packet_template_versions_platform_admin_select', 'document_packet_template_versions_platform_admin_write',
        'document_packet_template_audit_platform_admin_select', 'document_packet_template_audit_platform_admin_insert'
      )
  ),
  'storage_policies', (
    select count(*) from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname like 'legal_templates%'
  ),
  'legal_templates_bucket_private', (
    select not public from storage.buckets where id = 'legal-templates'
  ),
  'template_rows', (select count(*) from public.document_packet_templates),
  'version_rows', (select count(*) from public.document_packet_template_versions),
  'orphan_template_rows', (
    select count(*)
    from public.document_packet_templates template
    left join public.organisations organisation on organisation.id = template.organisation_id
    where template.organisation_id is not null and organisation.id is null
  ),
  'orphan_version_rows', (
    select count(*)
    from public.document_packet_template_versions version
    left join public.organisations organisation on organisation.id = version.organisation_id
    where version.organisation_id is not null and organisation.id is null
  ),
  'anon_can_use_storage_path_helper', has_function_privilege('anon', 'public.bridge_is_legal_template_storage_path(text)', 'EXECUTE'),
  'authenticated_can_use_storage_path_helper', has_function_privilege('authenticated', 'public.bridge_is_legal_template_storage_path(text)', 'EXECUTE'),
  'anon_can_check_platform_admin', has_function_privilege('anon', 'public.bridge_is_platform_admin()', 'EXECUTE'),
  'authenticated_can_check_platform_admin', has_function_privilege('authenticated', 'public.bridge_is_platform_admin()', 'EXECUTE'),
  'authenticated_can_run_audit_trigger_function', has_function_privilege('authenticated', 'public.bridge_document_packet_template_audit()', 'EXECUTE')
) as phase5_verification;
