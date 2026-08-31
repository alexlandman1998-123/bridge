begin;

-- Staging legitimately has a smaller reporting surface than production. Apply
-- the same browser boundary only to views that exist, without creating dummy
-- relations or granting access around their RLS-enabled base tables.
do $harden_views$
declare
  target record;
  product_views constant text[] := array[
    'attorney_invites',
    'attorney_team_members',
    'bridge_attorney_workflow_step_templates_v1',
    'organisation_email_branding_readiness',
    'partner_relationship_metrics'
  ];
  diagnostic_views constant text[] := array[
    'canonical_document_approved_without_satisfier',
    'canonical_document_duplicate_active_requirements',
    'canonical_document_legacy_rows_without_canonical_link',
    'canonical_document_requirements_missing_definitions',
    'canonical_document_requirements_without_uploader',
    'canonical_document_unlinked_documents',
    'canonical_document_unlinked_packet_versions'
  ];
begin
  for target in
    select namespace.nspname as schema_name, relation.relname as view_name
    from pg_class relation
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relkind = 'v'
      and relation.relname = any(product_views || diagnostic_views)
  loop
    execute format('alter view %I.%I set (security_invoker = true)', target.schema_name, target.view_name);
    execute format('revoke select on %I.%I from public, anon', target.schema_name, target.view_name);
    execute format('grant select on %I.%I to service_role', target.schema_name, target.view_name);

    if target.view_name = any(product_views) then
      execute format('grant select on %I.%I to authenticated', target.schema_name, target.view_name);
    else
      execute format('revoke select on %I.%I from authenticated', target.schema_name, target.view_name);
    end if;
  end loop;
end
$harden_views$;

do $verify$
declare
  unsafe_views text[];
  anonymous_views text[];
  browser_diagnostics text[];
  target_views constant text[] := array[
    'attorney_invites',
    'attorney_team_members',
    'bridge_attorney_workflow_step_templates_v1',
    'organisation_email_branding_readiness',
    'partner_relationship_metrics',
    'canonical_document_approved_without_satisfier',
    'canonical_document_duplicate_active_requirements',
    'canonical_document_legacy_rows_without_canonical_link',
    'canonical_document_requirements_missing_definitions',
    'canonical_document_requirements_without_uploader',
    'canonical_document_unlinked_documents',
    'canonical_document_unlinked_packet_versions'
  ];
  diagnostic_views constant text[] := array[
    'canonical_document_approved_without_satisfier',
    'canonical_document_duplicate_active_requirements',
    'canonical_document_legacy_rows_without_canonical_link',
    'canonical_document_requirements_missing_definitions',
    'canonical_document_requirements_without_uploader',
    'canonical_document_unlinked_documents',
    'canonical_document_unlinked_packet_versions'
  ];
begin
  select array_agg(relation.relname order by relation.relname)
  into unsafe_views
  from pg_class relation
  join pg_namespace namespace on namespace.oid = relation.relnamespace
  where namespace.nspname = 'public'
    and relation.relkind = 'v'
    and relation.relname = any(target_views)
    and not coalesce(relation.reloptions, '{}'::text[]) @> array['security_invoker=true'];

  select array_agg(relation.relname order by relation.relname)
  into anonymous_views
  from pg_class relation
  join pg_namespace namespace on namespace.oid = relation.relnamespace
  where namespace.nspname = 'public'
    and relation.relkind = 'v'
    and relation.relname = any(target_views)
    and has_table_privilege('anon', relation.oid, 'select');

  select array_agg(relation.relname order by relation.relname)
  into browser_diagnostics
  from pg_class relation
  join pg_namespace namespace on namespace.oid = relation.relnamespace
  where namespace.nspname = 'public'
    and relation.relkind = 'v'
    and relation.relname = any(diagnostic_views)
    and has_table_privilege('authenticated', relation.oid, 'select');

  if coalesce(cardinality(unsafe_views), 0) > 0 then
    raise exception 'Staging views remain security-definer: %', unsafe_views;
  end if;
  if coalesce(cardinality(anonymous_views), 0) > 0 then
    raise exception 'Anonymous SELECT remains on staging views: %', anonymous_views;
  end if;
  if coalesce(cardinality(browser_diagnostics), 0) > 0 then
    raise exception 'Canonical diagnostics remain browser-readable: %', browser_diagnostics;
  end if;
end
$verify$;

notify pgrst, 'reload schema';

commit;
