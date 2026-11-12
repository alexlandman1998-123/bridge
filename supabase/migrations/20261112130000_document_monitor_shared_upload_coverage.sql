begin;

-- The collector remains service-only. Include pre-transaction files and their
-- handover identities without exposing this private upload table to browsers.
grant usage on schema document_requirement_private to service_role;
grant select on document_requirement_private.uploads to service_role;
do $patch$
declare definition text;
begin
  select pg_get_functiondef('public.document_persistence_monitor_snapshot(text)'::regprocedure) into definition;
  if position('document_monitor_shared_upload_coverage_v1' in definition)>0 then return; end if;
  if position('with roots as materialized (' in definition)=0
     or position('), direct_refs as (' in definition)=0
     or position($m$('documents'),$m$ in definition)=0
     or position($m$'documents',(select$m$ in definition)=0 then
    raise exception 'Document monitor snapshot changed; review shared-upload coverage before applying.';
  end if;
  definition:=replace(definition,'with roots as materialized (',$m$-- document_monitor_shared_upload_coverage_v1
with roots as materialized (
select 'requirement_uploads' as source,
  jsonb_build_object('id',t.id,'requirement_id',t.requirement_id,'document_id',t.document_id,'file_path',t.file_path) as row
from document_requirement_private.uploads t
union all
$m$);
  definition:=replace(definition,'), direct_refs as (',$m$), direct_refs as (
select source,row,'file_path' as field,'documents' as bucket,
  regexp_replace(row->>'file_path','[?].*$','') as path from roots where source='requirement_uploads'
union all
$m$);
  definition:=replace(definition,$m$('documents'),$m$,$m$('documents'),('requirement_uploads'),$m$);
  definition:=replace(definition,$m$'documents',(select$m$,$m$'requirementUploads',(select coalesce(jsonb_agg(row),'[]'::jsonb) from roots where source='requirement_uploads'),
'documents',(select$m$);
  execute definition;
end;
$patch$;
notify pgrst,'reload schema';
commit;
