-- Keep the service-only hosted snapshot aligned with the local all-store audit.
-- This replaces only the read function body; file records and bytes are untouched.
do $patch$
declare
  definition text;
  root_marker text := $text$select 'rental_landlord_onboarding_documents' as source, jsonb_build_object$text$;
  refs_marker text := $text$), direct_refs as ($text$;
  inventory_marker text := $text$('rental_application_documents'),$text$;
  buckets_marker text := $text$'rental-application-documents','rental-landlord-onboarding'$text$;
  trace_marker text := $text$'routepath','route_path')$text$;
begin
  select pg_get_functiondef('public.document_persistence_monitor_snapshot(text)'::regprocedure) into definition;
  if position('document_snapshot_lease_coverage_v1' in definition) > 0 then return; end if;
  if position(root_marker in definition) = 0 or position(refs_marker in definition) = 0
     or position(inventory_marker in definition) = 0 or position(buckets_marker in definition) = 0
     or position(trace_marker in definition) = 0 then
    raise exception 'Document snapshot changed; review the lease coverage patch before applying.';
  end if;
  definition := replace(definition, root_marker, $text$select 'rental_lease_document_uploads' as source,
    jsonb_build_object('id',t.id,'storage_path',t.storage_path,'storage_bucket',t.storage_bucket) as row
    from public.rental_lease_document_uploads t
union all
$text$ || root_marker);
  definition := replace(definition, refs_marker, refs_marker || $text$
select source, row, 'storage_path' as field,
  coalesce(nullif(row->>'storage_bucket', ''), 'rental-lease-files') as bucket,
  regexp_replace(row->>'storage_path', '[?].*$', '') as path
from roots where source='rental_lease_document_uploads'
union all
$text$);
  definition := replace(definition, inventory_marker,
    $text$('rental_application_documents'),('rental_lease_document_uploads'),$text$);
  definition := replace(definition, buckets_marker,
    $text$'rental-application-documents','rental-lease-files','rental-landlord-onboarding'$text$);
  definition := replace(definition, trace_marker,
    $text$'routepath','route_path','sourceruleorlegacypath','source_rule_or_legacy_path')$text$);
  definition := replace(definition, 'with roots as materialized',
    E'-- document_snapshot_lease_coverage_v1\nwith roots as materialized');
  execute definition;
end;
$patch$;
