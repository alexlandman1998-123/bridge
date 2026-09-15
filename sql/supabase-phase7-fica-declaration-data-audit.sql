-- Read-only verification for migration 20260913190000. It returns only
-- canonical configuration identifiers and boolean compliance results.
with expected_definitions(key, display_label, description, category, pack_key, applies_to_context, default_requirement_level, default_visibility, default_upload_roles, review_required, sort_order, metadata_json) as (
  values
    ('buyer_fica_declaration', 'Buyer FICA Declaration', 'Signed buyer FICA declaration supplied through onboarding or an agent-assisted physical upload.', 'buyer_identity_fica', 'buyer_identity_fica', array['buyer_onboarding', 'transaction']::text[], 'required', array['buyer', 'agent', 'agency_admin', 'transferring_attorney']::text[], array['buyer', 'agent']::text[], true, 5, '{"compliance_pack_key":"fica_declaration","party":"buyer","manual_upload_source":"agent_physical_upload"}'::jsonb),
    ('seller_fica_declaration', 'Seller FICA Declaration', 'Signed seller FICA declaration supplied through onboarding or an agent-assisted physical upload.', 'seller_identity_fica', 'seller_identity_fica', array['seller_onboarding', 'private_listing', 'transaction']::text[], 'required', array['seller', 'agent', 'agency_admin', 'transferring_attorney']::text[], array['seller', 'agent']::text[], true, 5, '{"compliance_pack_key":"fica_declaration","party":"seller","manual_upload_source":"agent_physical_upload","legacy_aliases":["signed_fica_declaration","signed_fica_declaration_pack","signed_fica_form"]}'::jsonb)
),
expected_rules(id, document_definition_key, pack_key, context_type, condition_json, requirement_level, stage_gates, requested_from_role, visible_to_roles, uploadable_by_roles, reviewer_role, priority, resolver_key) as (
  values
    ('00000000-0000-4000-8000-000000000101'::uuid, 'buyer_fica_declaration', 'buyer_identity_fica', 'buyer_onboarding', '{"all":[{"fact":"buyer.legal_type","operator":"exists"}]}'::jsonb, 'required', array['otp_ready', 'attorney_instruction_ready']::text[], 'buyer', array['buyer', 'agent', 'agency_admin', 'transferring_attorney']::text[], array['buyer', 'agent']::text[], 'agent', 105, 'canonical_document_rules_v1'),
    ('00000000-0000-4000-8000-000000000102'::uuid, 'buyer_fica_declaration', 'buyer_identity_fica', 'transaction', '{"all":[{"fact":"buyer.legal_type","operator":"exists"}]}'::jsonb, 'required', array['otp_ready', 'attorney_instruction_ready']::text[], 'buyer', array['buyer', 'agent', 'agency_admin', 'transferring_attorney']::text[], array['buyer', 'agent']::text[], 'agent', 106, 'canonical_document_rules_v1'),
    ('00000000-0000-4000-8000-000000000103'::uuid, 'seller_fica_declaration', 'seller_identity_fica', 'seller_onboarding', '{"all":[{"fact":"seller.legal_type","operator":"exists"}]}'::jsonb, 'required', array['mandate_ready', 'listing_ready']::text[], 'seller', array['seller', 'agent', 'agency_admin', 'transferring_attorney']::text[], array['seller', 'agent']::text[], 'agent', 15, 'canonical_document_rules_v1'),
    ('00000000-0000-4000-8000-000000000104'::uuid, 'seller_fica_declaration', 'seller_identity_fica', 'private_listing', '{"all":[{"fact":"seller.legal_type","operator":"exists"}]}'::jsonb, 'required', array['mandate_ready', 'listing_ready', 'attorney_instruction_ready']::text[], 'seller', array['seller', 'agent', 'agency_admin', 'transferring_attorney']::text[], array['seller', 'agent']::text[], 'agent', 16, 'canonical_document_rules_v1'),
    ('00000000-0000-4000-8000-000000000105'::uuid, 'seller_fica_declaration', 'seller_identity_fica', 'transaction', '{"all":[{"fact":"seller.legal_type","operator":"exists"}]}'::jsonb, 'required', array['attorney_instruction_ready']::text[], 'seller', array['seller', 'agent', 'agency_admin', 'transferring_attorney']::text[], array['seller', 'agent']::text[], 'agent', 17, 'canonical_document_rules_v1')
)
select
  'definition' as record_type,
  expected.key as record_id,
  actual.key is not null as present,
  actual.key is not null
    and actual.display_label = expected.display_label
    and actual.description = expected.description
    and actual.category = expected.category
    and actual.pack_key = expected.pack_key
    and actual.applies_to_context = expected.applies_to_context
    and actual.default_requirement_level = expected.default_requirement_level
    and actual.default_visibility = expected.default_visibility
    and actual.default_upload_roles = expected.default_upload_roles
    and actual.review_required = expected.review_required
    and actual.sort_order = expected.sort_order
    and actual.is_active
    and actual.metadata_json @> expected.metadata_json as canonical_match
from expected_definitions expected
left join public.document_definitions actual using (key)
union all
select
  'rule' as record_type,
  expected.id::text as record_id,
  actual.id is not null as present,
  actual.id is not null
    and actual.document_definition_key = expected.document_definition_key
    and actual.pack_key = expected.pack_key
    and actual.context_type = expected.context_type
    and actual.condition_json = expected.condition_json
    and actual.requirement_level = expected.requirement_level
    and actual.stage_gates = expected.stage_gates
    and actual.requested_from_role = expected.requested_from_role
    and actual.visible_to_roles = expected.visible_to_roles
    and actual.uploadable_by_roles = expected.uploadable_by_roles
    and actual.reviewer_role = expected.reviewer_role
    and actual.priority = expected.priority
    and actual.resolver_key = expected.resolver_key
    and actual.is_active as canonical_match
from expected_rules expected
left join public.document_requirement_rules actual using (id)
order by record_type, record_id;
