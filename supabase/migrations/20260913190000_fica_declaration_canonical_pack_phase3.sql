-- Phase 3: canonical declaration identities for the buyer and seller FICA pack.
-- This migration defines document metadata only; it does not mark existing evidence verified.

begin;

insert into public.document_definitions (
  key, display_label, description, category, pack_key, applies_to_context,
  default_requirement_level, default_visibility, default_upload_roles,
  review_required, validity_period_days, sort_order, metadata_json
)
values
  (
    'buyer_fica_declaration',
    'Buyer FICA Declaration',
    'Signed buyer FICA declaration supplied through onboarding or an agent-assisted physical upload.',
    'buyer_identity_fica', 'buyer_identity_fica', array['buyer_onboarding', 'transaction'],
    'required', array['buyer', 'agent', 'agency_admin', 'transferring_attorney'], array['buyer', 'agent'],
    true, null, 5,
    '{"compliance_pack_key":"fica_declaration","party":"buyer","manual_upload_source":"agent_physical_upload"}'::jsonb
  ),
  (
    'seller_fica_declaration',
    'Seller FICA Declaration',
    'Signed seller FICA declaration supplied through onboarding or an agent-assisted physical upload.',
    'seller_identity_fica', 'seller_identity_fica', array['seller_onboarding', 'private_listing', 'transaction'],
    'required', array['seller', 'agent', 'agency_admin', 'transferring_attorney'], array['seller', 'agent'],
    true, null, 5,
    '{"compliance_pack_key":"fica_declaration","party":"seller","manual_upload_source":"agent_physical_upload","legacy_aliases":["signed_fica_declaration","signed_fica_declaration_pack","signed_fica_form"]}'::jsonb
  )
on conflict (key) do update
set display_label = excluded.display_label,
    description = excluded.description,
    category = excluded.category,
    pack_key = excluded.pack_key,
    applies_to_context = excluded.applies_to_context,
    default_requirement_level = excluded.default_requirement_level,
    default_visibility = excluded.default_visibility,
    default_upload_roles = excluded.default_upload_roles,
    review_required = excluded.review_required,
    sort_order = excluded.sort_order,
    metadata_json = coalesce(public.document_definitions.metadata_json, '{}'::jsonb) || excluded.metadata_json,
    is_active = true,
    updated_at = now();

insert into public.document_requirement_rules (
  id, document_definition_key, pack_key, context_type, condition_json,
  requirement_level, stage_gates, requested_from_role, visible_to_roles,
  uploadable_by_roles, reviewer_role, priority, resolver_key
)
values
  (
    '00000000-0000-4000-8000-000000000101'::uuid, 'buyer_fica_declaration', 'buyer_identity_fica', 'buyer_onboarding',
    '{"all":[{"fact":"buyer.legal_type","operator":"exists"}]}'::jsonb,
    'required', array['otp_ready', 'attorney_instruction_ready'], 'buyer',
    array['buyer', 'agent', 'agency_admin', 'transferring_attorney'], array['buyer', 'agent'], 'agent', 105,
    'canonical_document_rules_v1'
  ),
  (
    '00000000-0000-4000-8000-000000000102'::uuid, 'buyer_fica_declaration', 'buyer_identity_fica', 'transaction',
    '{"all":[{"fact":"buyer.legal_type","operator":"exists"}]}'::jsonb,
    'required', array['otp_ready', 'attorney_instruction_ready'], 'buyer',
    array['buyer', 'agent', 'agency_admin', 'transferring_attorney'], array['buyer', 'agent'], 'agent', 106,
    'canonical_document_rules_v1'
  ),
  (
    '00000000-0000-4000-8000-000000000103'::uuid, 'seller_fica_declaration', 'seller_identity_fica', 'seller_onboarding',
    '{"all":[{"fact":"seller.legal_type","operator":"exists"}]}'::jsonb,
    'required', array['mandate_ready', 'listing_ready'], 'seller',
    array['seller', 'agent', 'agency_admin', 'transferring_attorney'], array['seller', 'agent'], 'agent', 15,
    'canonical_document_rules_v1'
  ),
  (
    '00000000-0000-4000-8000-000000000104'::uuid, 'seller_fica_declaration', 'seller_identity_fica', 'private_listing',
    '{"all":[{"fact":"seller.legal_type","operator":"exists"}]}'::jsonb,
    'required', array['mandate_ready', 'listing_ready', 'attorney_instruction_ready'], 'seller',
    array['seller', 'agent', 'agency_admin', 'transferring_attorney'], array['seller', 'agent'], 'agent', 16,
    'canonical_document_rules_v1'
  ),
  (
    '00000000-0000-4000-8000-000000000105'::uuid, 'seller_fica_declaration', 'seller_identity_fica', 'transaction',
    '{"all":[{"fact":"seller.legal_type","operator":"exists"}]}'::jsonb,
    'required', array['attorney_instruction_ready'], 'seller',
    array['seller', 'agent', 'agency_admin', 'transferring_attorney'], array['seller', 'agent'], 'agent', 17,
    'canonical_document_rules_v1'
  )
on conflict (id) do update
set document_definition_key = excluded.document_definition_key,
    pack_key = excluded.pack_key,
    context_type = excluded.context_type,
    condition_json = excluded.condition_json,
    requirement_level = excluded.requirement_level,
    stage_gates = excluded.stage_gates,
    requested_from_role = excluded.requested_from_role,
    visible_to_roles = excluded.visible_to_roles,
    uploadable_by_roles = excluded.uploadable_by_roles,
    reviewer_role = excluded.reviewer_role,
    priority = excluded.priority,
    resolver_key = excluded.resolver_key,
    is_active = true;

notify pgrst, 'reload schema';
commit;
