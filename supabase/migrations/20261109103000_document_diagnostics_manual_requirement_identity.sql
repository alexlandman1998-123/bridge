-- Custom requests are independently identified by their requirement UUID.
-- Do not report separate custom requests or separate subjects as duplicates.
-- Keep invoker security and the existing view columns/grants intact.
create or replace view public.canonical_document_requirements_missing_definitions
with (security_invoker = true) as
select i.id as requirement_instance_id, i.document_definition_key,
  i.context_type, i.context_id, i.status, i.created_at
from public.document_requirement_instances i
left join public.document_definitions d on d.key = i.document_definition_key
where (i.document_definition_key is not null and d.key is null)
   or (i.document_definition_key is null and
       (coalesce(i.requirement_origin, '') <> 'manual' or nullif(trim(i.custom_label), '') is null));

create or replace view public.canonical_document_duplicate_active_requirements
with (security_invoker = true) as
select context_type, context_id, document_definition_key,
  requested_from_role, requested_from_contact_id,
  count(*) as active_count, array_agg(id order by created_at) as requirement_instance_ids
from public.document_requirement_instances
where status <> 'not_applicable'
  and coalesce(applicability_override, '') <> 'removed'
  and document_definition_key is not null
group by context_type, context_id, document_definition_key,
  requested_from_role, requested_from_contact_id, subject_kind, subject_id
having count(*) > 1;
