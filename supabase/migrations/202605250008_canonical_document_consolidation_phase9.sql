-- Phase 9: Canonical Document System consolidation support.
-- This migration is intentionally additive. Legacy document tables remain intact
-- and are treated as compatibility/projection surfaces until production parity is proven.

comment on table public.document_packs is
  'Canonical document pack definitions. Phase 9 source-of-truth target for document grouping.';
comment on table public.document_definitions is
  'Canonical global document definitions. Phase 9 source-of-truth target for document types.';
comment on table public.document_requirement_instances is
  'Canonical contextual document requirements. Phase 9 controlled source-of-truth target for requirements, statuses, blockers and satisfiers.';
comment on table public.document_requirement_rules is
  'Canonical conditional document requirement rules used by the resolver.';
comment on table public.document_requirement_reviews is
  'Canonical review history for document requirement instances.';
comment on table public.document_requirement_events is
  'Canonical audit log for document requirement lifecycle, adapter, reminder and gate events.';
comment on table public.document_requirement_reminders is
  'Canonical reminder and follow-up records. Legacy document_requests remain a compatibility projection.';
comment on table public.private_listing_document_requirements is
  'Legacy compatibility/projection table for private listing document requirements. Do not delete in Phase 9; canonical source is document_requirement_instances.';
comment on table public.private_listing_documents is
  'Legacy compatibility/projection table for private listing uploads. Do not delete in Phase 9; canonical satisfier links live on document_requirement_instances.';
comment on table public.transaction_required_documents is
  'Legacy compatibility/projection table for transaction required documents. Do not delete in Phase 9; canonical source is document_requirement_instances.';
comment on table public.document_requests is
  'Legacy communication/request surface. In the canonical architecture this is a projection of reminders/requirement instances, not the requirement source of truth.';
comment on table public.documents is
  'Primary file/artifact table retained for uploaded document records. Canonical requirement linkage should use canonical_requirement_instance_id where available.';
comment on table public.document_packets is
  'Generated document packet table retained for packet workflows. Signed/generated packets should satisfy canonical requirement instances where applicable.';
comment on table public.document_packet_versions is
  'Generated document packet version table retained for packet workflows. Packet versions should link to canonical requirement instances where applicable.';
create or replace view public.canonical_document_requirements_missing_definitions as
select
  i.id as requirement_instance_id,
  i.document_definition_key,
  i.context_type,
  i.context_id,
  i.status,
  i.created_at
from public.document_requirement_instances i
left join public.document_definitions d
  on d.key = i.document_definition_key
where d.key is null;
create or replace view public.canonical_document_duplicate_active_requirements as
select
  context_type,
  context_id,
  document_definition_key,
  requested_from_role,
  requested_from_contact_id,
  count(*) as active_count,
  array_agg(id order by created_at) as requirement_instance_ids
from public.document_requirement_instances
where status <> 'not_applicable'
group by
  context_type,
  context_id,
  document_definition_key,
  requested_from_role,
  requested_from_contact_id
having count(*) > 1;
create or replace view public.canonical_document_requirements_without_uploader as
select
  id as requirement_instance_id,
  document_definition_key,
  context_type,
  context_id,
  requirement_level,
  status,
  requested_from_role,
  uploadable_by_roles
from public.document_requirement_instances
where status not in ('approved', 'completed', 'waived', 'not_applicable')
  and requirement_level in ('blocker', 'required')
  and (
    coalesce(requested_from_role, '') = ''
    or coalesce(array_length(uploadable_by_roles, 1), 0) = 0
  );
create or replace view public.canonical_document_approved_without_satisfier as
select
  id as requirement_instance_id,
  document_definition_key,
  context_type,
  context_id,
  status,
  satisfied_by_document_id,
  satisfied_by_packet_id,
  satisfied_by_packet_version_id
from public.document_requirement_instances
where status in ('approved', 'completed')
  and satisfied_by_document_id is null
  and satisfied_by_packet_id is null
  and satisfied_by_packet_version_id is null;
create or replace view public.canonical_document_legacy_rows_without_canonical_link as
select
  'private_listing_document_requirements'::text as legacy_table,
  id::text as legacy_id,
  private_listing_id::text as context_id,
  requirement_key as legacy_key,
  status
from public.private_listing_document_requirements
where canonical_requirement_instance_id is null
union all
select
  'transaction_required_documents'::text as legacy_table,
  id::text as legacy_id,
  transaction_id::text as context_id,
  document_key as legacy_key,
  status
from public.transaction_required_documents
where canonical_requirement_instance_id is null
union all
select
  'document_requests'::text as legacy_table,
  id::text as legacy_id,
  transaction_id::text as context_id,
  document_type as legacy_key,
  status
from public.document_requests
where canonical_requirement_instance_id is null;
create or replace view public.canonical_document_unlinked_documents as
select
  id as document_id,
  transaction_id,
  category,
  document_type,
  created_at
from public.documents
where canonical_requirement_instance_id is null;
create or replace view public.canonical_document_unlinked_packet_versions as
select
  v.id as packet_version_id,
  v.packet_id,
  p.transaction_id,
  p.packet_type,
  p.status as packet_status,
  v.created_at
from public.document_packet_versions v
left join public.document_packets p
  on p.id = v.packet_id
where v.canonical_requirement_instance_id is null;
create index if not exists document_requirement_instances_source_status_idx
  on public.document_requirement_instances (source_system, status);
create index if not exists document_requirement_events_source_created_idx
  on public.document_requirement_events ((metadata_json ->> 'source_system'), created_at desc);
grant select on public.canonical_document_requirements_missing_definitions to authenticated;
grant select on public.canonical_document_duplicate_active_requirements to authenticated;
grant select on public.canonical_document_requirements_without_uploader to authenticated;
grant select on public.canonical_document_approved_without_satisfier to authenticated;
grant select on public.canonical_document_legacy_rows_without_canonical_link to authenticated;
grant select on public.canonical_document_unlinked_documents to authenticated;
grant select on public.canonical_document_unlinked_packet_versions to authenticated;
