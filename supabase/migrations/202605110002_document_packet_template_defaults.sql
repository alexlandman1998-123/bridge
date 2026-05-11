begin;

-- Ensure document packet template defaults exist in linked environments.
-- The app can render a runtime fallback, but these global rows make the
-- mandate/OTP template registry refresh-safe and discoverable.

create unique index if not exists document_packet_templates_global_key_version_unique
on public.document_packet_templates (template_key, version_tag)
where organisation_id is null;

create unique index if not exists document_template_sections_template_key_unique
on public.document_template_sections (template_id, section_key);

grant select on table public.document_packet_templates to authenticated;
grant select on table public.document_template_sections to authenticated;
grant select on table public.document_placeholder_registry to authenticated;

insert into public.document_packet_templates (
  organisation_id,
  module_type,
  packet_type,
  template_key,
  template_label,
  template_format,
  version_tag,
  description,
  is_default,
  is_active,
  metadata_json
)
values
  (
    null,
    'agency',
    'otp',
    'otp_default_v1',
    'Offer to Purchase (OTP) · Default',
    'docx',
    'v1',
    'Default structured OTP packet template for agency transactions.',
    true,
    true,
    jsonb_build_object(
      'template_scope', 'global_default',
      'document_family', 'otp',
      'preview_layout', 'three_panel_packet'
    )
  ),
  (
    null,
    'agency',
    'mandate',
    'mandate_default_v1',
    'Mandate Agreement · Default',
    'docx',
    'v1',
    'Default structured seller mandate packet template for agency workflows.',
    true,
    true,
    jsonb_build_object(
      'template_scope', 'global_default',
      'document_family', 'mandate',
      'preview_layout', 'three_panel_packet'
    )
  )
on conflict (template_key, version_tag) where organisation_id is null
do update set
  module_type = excluded.module_type,
  packet_type = excluded.packet_type,
  template_label = excluded.template_label,
  template_format = excluded.template_format,
  description = excluded.description,
  is_default = true,
  is_active = true,
  metadata_json = public.document_packet_templates.metadata_json || excluded.metadata_json,
  updated_at = now();

with mandate_template as (
  select id
  from public.document_packet_templates
  where organisation_id is null
    and template_key = 'mandate_default_v1'
    and version_tag = 'v1'
  limit 1
)
insert into public.document_template_sections (
  template_id,
  section_key,
  section_label,
  section_type,
  sort_order,
  is_required,
  is_repeatable,
  condition_json,
  placeholder_keys,
  legal_text,
  metadata_json
)
select
  mandate_template.id,
  section.section_key,
  section.section_label,
  section.section_type,
  section.sort_order,
  section.is_required,
  false,
  section.condition_json,
  section.placeholder_keys,
  null,
  section.metadata_json
from mandate_template
cross join (
  values
    (
      'introduction_purpose',
      'Introduction and Purpose',
      'legal_text',
      1,
      true,
      '{}'::jsonb,
      array['mandate_introduction_purpose']::text[],
      jsonb_build_object('section_title', 'Introduction and Purpose', 'section_order', 1, 'required_placeholders', array['mandate_introduction_purpose'], 'editable_by', array['principal', 'super_admin', 'admin', 'agent'])
    ),
    (
      'parties',
      'Parties',
      'dynamic_fields',
      2,
      true,
      '{}'::jsonb,
      array['seller_full_name', 'seller_id_number', 'seller_email', 'agent_full_name', 'agency_name']::text[],
      jsonb_build_object('section_title', 'Parties', 'section_order', 2, 'required_placeholders', array['seller_full_name', 'agent_full_name', 'agency_name'], 'editable_by', array['principal', 'super_admin', 'admin', 'agent'])
    ),
    (
      'property_details',
      'Property Details',
      'dynamic_fields',
      3,
      true,
      '{}'::jsonb,
      array['property_address', 'property_type']::text[],
      jsonb_build_object('section_title', 'Property Details', 'section_order', 3, 'required_placeholders', array['property_address'], 'editable_by', array['principal', 'super_admin', 'admin', 'agent'])
    ),
    (
      'mandate_terms',
      'Mandate Terms',
      'dynamic_fields',
      4,
      true,
      '{}'::jsonb,
      array['mandate_type', 'mandate_start_date', 'mandate_end_date', 'mandate_authority_granted']::text[],
      jsonb_build_object('section_title', 'Mandate Terms', 'section_order', 4, 'required_placeholders', array['mandate_type', 'mandate_authority_granted'], 'editable_by', array['principal', 'super_admin', 'admin', 'agent'])
    ),
    (
      'commission_terms',
      'Commission Terms',
      'dynamic_fields',
      5,
      true,
      '{}'::jsonb,
      array['commission_structure', 'mandate_commission_percent', 'mandate_commission_amount', 'vat_handling', 'asking_price']::text[],
      jsonb_build_object('section_title', 'Commission Terms', 'section_order', 5, 'required_placeholders', array['commission_structure'], 'editable_by', array['principal', 'super_admin', 'admin', 'agent'])
    ),
    (
      'marketing_listing_terms',
      'Marketing / Listing Terms',
      'dynamic_fields',
      6,
      false,
      '{}'::jsonb,
      array['asking_price', 'mandate_marketing_permissions', 'mandate_access_instructions']::text[],
      jsonb_build_object('section_title', 'Marketing / Listing Terms', 'section_order', 6, 'required_placeholders', array[]::text[], 'editable_by', array['principal', 'super_admin', 'admin', 'agent'])
    ),
    (
      'special_conditions',
      'Special Conditions',
      'dynamic_fields',
      7,
      false,
      '{}'::jsonb,
      array['special_conditions']::text[],
      jsonb_build_object('section_title', 'Special Conditions', 'section_order', 7, 'required_placeholders', array[]::text[], 'editable_by', array['principal', 'super_admin', 'admin', 'agent'])
    ),
    (
      'signature_pages',
      'Signature Pages',
      'signature_zone',
      8,
      true,
      '{}'::jsonb,
      array['seller_full_name']::text[],
      jsonb_build_object('section_title', 'Signature Pages', 'section_order', 8, 'required_placeholders', array['seller_full_name'], 'editable_by', array['principal', 'super_admin', 'admin', 'agent'])
    )
) as section(
  section_key,
  section_label,
  section_type,
  sort_order,
  is_required,
  condition_json,
  placeholder_keys,
  metadata_json
)
on conflict (template_id, section_key)
do update set
  section_label = excluded.section_label,
  section_type = excluded.section_type,
  sort_order = excluded.sort_order,
  is_required = excluded.is_required,
  condition_json = excluded.condition_json,
  placeholder_keys = excluded.placeholder_keys,
  metadata_json = excluded.metadata_json,
  updated_at = now();

with otp_template as (
  select id
  from public.document_packet_templates
  where organisation_id is null
    and template_key = 'otp_default_v1'
    and version_tag = 'v1'
  limit 1
)
insert into public.document_template_sections (
  template_id,
  section_key,
  section_label,
  section_type,
  sort_order,
  is_required,
  is_repeatable,
  condition_json,
  placeholder_keys,
  legal_text,
  metadata_json
)
select
  otp_template.id,
  section.section_key,
  section.section_label,
  section.section_type,
  section.sort_order,
  section.is_required,
  false,
  '{}'::jsonb,
  section.placeholder_keys,
  null,
  section.metadata_json
from otp_template
cross join (
  values
    ('buyer_details', 'Buyer Details', 'dynamic_fields', 1, true, array['buyer_full_name', 'buyer_id_number', 'buyer_email']::text[], jsonb_build_object('section_title', 'Buyer Details', 'section_order', 1, 'required_placeholders', array['buyer_full_name'], 'editable_by', array['principal', 'super_admin', 'admin', 'agent'])),
    ('seller_details', 'Seller Details', 'dynamic_fields', 2, true, array['seller_full_name', 'seller_id_number']::text[], jsonb_build_object('section_title', 'Seller Details', 'section_order', 2, 'required_placeholders', array['seller_full_name'], 'editable_by', array['principal', 'super_admin', 'admin', 'agent'])),
    ('property_details', 'Property', 'dynamic_fields', 3, true, array['unit_number', 'property_address', 'property_suburb']::text[], jsonb_build_object('section_title', 'Property', 'section_order', 3, 'required_placeholders', array['property_address'], 'editable_by', array['principal', 'super_admin', 'admin', 'agent'])),
    ('purchase_terms', 'Purchase Terms', 'dynamic_fields', 4, true, array['purchase_price', 'deposit_amount', 'finance_type']::text[], jsonb_build_object('section_title', 'Purchase Terms', 'section_order', 4, 'required_placeholders', array['purchase_price'], 'editable_by', array['principal', 'super_admin', 'admin', 'agent'])),
    ('commission_terms', 'Commission Terms', 'dynamic_fields', 5, true, array['gross_commission_percentage', 'gross_commission_amount', 'agent_commission_amount', 'agency_commission_amount']::text[], jsonb_build_object('section_title', 'Commission Terms', 'section_order', 5, 'required_placeholders', array[]::text[], 'editable_by', array['principal', 'super_admin', 'admin', 'agent'])),
    ('special_conditions', 'Special Conditions', 'dynamic_fields', 6, false, array['special_conditions']::text[], jsonb_build_object('section_title', 'Special Conditions', 'section_order', 6, 'required_placeholders', array[]::text[], 'editable_by', array['principal', 'super_admin', 'admin', 'agent'])),
    ('signature_pages', 'Signature Pages', 'signature_zone', 7, true, array['buyer_full_name', 'seller_full_name']::text[], jsonb_build_object('section_title', 'Signature Pages', 'section_order', 7, 'required_placeholders', array['buyer_full_name', 'seller_full_name'], 'editable_by', array['principal', 'super_admin', 'admin', 'agent']))
) as section(section_key, section_label, section_type, sort_order, is_required, placeholder_keys, metadata_json)
on conflict (template_id, section_key)
do update set
  section_label = excluded.section_label,
  section_type = excluded.section_type,
  sort_order = excluded.sort_order,
  is_required = excluded.is_required,
  placeholder_keys = excluded.placeholder_keys,
  metadata_json = excluded.metadata_json,
  updated_at = now();

commit;
