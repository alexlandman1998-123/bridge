-- Phase 5: approved FICA compliance outcome and historical certificate metadata.
-- Certificates are separate restricted documents. Source evidence and provider raw payloads stay outside the certificate.

begin;

alter table public.knowledge_factory_fica_cases
  add column if not exists staff_approval_status text not null default 'not_ready',
  add column if not exists staff_approved_by uuid references auth.users(id) on delete set null,
  add column if not exists staff_approved_at timestamptz,
  add column if not exists staff_approval_notes text,
  add column if not exists certificate_document_id uuid references public.documents(id) on delete set null,
  add column if not exists certificate_version integer not null default 0,
  add column if not exists certificate_superseded_at timestamptz,
  add column if not exists certificate_superseded_by uuid references public.documents(id) on delete set null;

alter table public.knowledge_factory_fica_cases
  drop constraint if exists knowledge_factory_fica_cases_staff_approval_status_check;
alter table public.knowledge_factory_fica_cases
  add constraint knowledge_factory_fica_cases_staff_approval_status_check check (
    staff_approval_status in ('not_ready', 'pending', 'approved', 'rejected', 'superseded')
  );

insert into public.document_packs (key, display_label, description, applies_to_context, default_visible_to_roles, sort_order)
values ('fica_compliance_outcome', 'FICA Compliance Outcome', 'Restricted approved FICA outcome certificates linked to a transaction.', array['transaction'], array['agent', 'agency_admin', 'transferring_attorney'], 115)
on conflict (key) do update set display_label = excluded.display_label, description = excluded.description, applies_to_context = excluded.applies_to_context, default_visible_to_roles = excluded.default_visible_to_roles, sort_order = excluded.sort_order, is_active = true;

insert into public.document_definitions (key, display_label, description, category, pack_key, applies_to_context, default_requirement_level, default_visibility, default_upload_roles, review_required, validity_period_days, sort_order, metadata_json)
values ('fica_compliance_certificate', 'FICA Compliance Certificate', 'Restricted certificate recording an approved FICA outcome. It excludes identity numbers, source evidence and raw provider payloads.', 'fica_compliance_outcome', 'fica_compliance_outcome', array['transaction'], 'optional', array['agent', 'agency_admin', 'transferring_attorney'], array['agency_admin'], true, null, 10, '{"restricted":true,"historical_versioning":true}'::jsonb)
on conflict (key) do update set display_label = excluded.display_label, description = excluded.description, category = excluded.category, pack_key = excluded.pack_key, applies_to_context = excluded.applies_to_context, default_requirement_level = excluded.default_requirement_level, default_visibility = excluded.default_visibility, default_upload_roles = excluded.default_upload_roles, review_required = excluded.review_required, sort_order = excluded.sort_order, metadata_json = coalesce(public.document_definitions.metadata_json, '{}'::jsonb) || excluded.metadata_json, is_active = true, updated_at = now();

insert into public.document_requirement_rules (id, document_definition_key, pack_key, context_type, condition_json, requirement_level, stage_gates, requested_from_role, visible_to_roles, uploadable_by_roles, reviewer_role, priority, resolver_key)
values ('00000000-0000-4000-8000-000000000106'::uuid, 'fica_compliance_certificate', 'fica_compliance_outcome', 'transaction', '{"all":[{"fact":"transaction.id","operator":"exists"}]}'::jsonb, 'optional', array['attorney_instruction_ready'], 'agency_admin', array['agent', 'agency_admin', 'transferring_attorney'], array['agency_admin'], 'agency_admin', 115, 'canonical_document_rules_v1')
on conflict (id) do update set document_definition_key = excluded.document_definition_key, pack_key = excluded.pack_key, context_type = excluded.context_type, condition_json = excluded.condition_json, requirement_level = excluded.requirement_level, stage_gates = excluded.stage_gates, requested_from_role = excluded.requested_from_role, visible_to_roles = excluded.visible_to_roles, uploadable_by_roles = excluded.uploadable_by_roles, reviewer_role = excluded.reviewer_role, priority = excluded.priority, resolver_key = excluded.resolver_key, is_active = true;

create index if not exists knowledge_factory_fica_cases_certificate_document_idx on public.knowledge_factory_fica_cases (certificate_document_id) where certificate_document_id is not null;

comment on column public.knowledge_factory_fica_cases.certificate_document_id is 'Current restricted FICA certificate. Superseded certificate documents remain historical and are never overwritten.';
notify pgrst, 'reload schema';
commit;
