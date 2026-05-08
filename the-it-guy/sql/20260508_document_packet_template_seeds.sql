begin;

with otp_seed as (
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
  values (
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
  )
  on conflict do nothing
  returning id
),
otp_template as (
  select id from otp_seed
  union all
  select t.id
  from public.document_packet_templates t
  where t.organisation_id is null
    and t.template_key = 'otp_default_v1'
    and t.version_tag = 'v1'
  limit 1
),
mandate_seed as (
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
  values (
    null,
    'agency',
    'mandate',
    'mandate_default_v1',
    'Seller Mandate · Default',
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
  on conflict do nothing
  returning id
),
mandate_template as (
  select id from mandate_seed
  union all
  select t.id
  from public.document_packet_templates t
  where t.organisation_id is null
    and t.template_key = 'mandate_default_v1'
    and t.version_tag = 'v1'
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
  section.condition_json,
  section.placeholder_keys,
  null,
  section.metadata_json
from otp_template
cross join (
  values
    (
      'header_branding',
      'Header / Branding',
      'metadata',
      1,
      true,
      '{}'::jsonb,
      array['organisation.name', 'organisation.logo_light_url', 'bridge.name']::text[],
      jsonb_build_object(
        'section_title', 'Header / Branding',
        'section_order', 1,
        'required_placeholders', array['organisation.name', 'organisation.logo_light_url', 'bridge.name'],
        'visibility_rules', jsonb_build_object(),
        'editable_by', array['principal', 'super_admin', 'admin']
      )
    ),
    (
      'seller_details',
      'Seller Details',
      'dynamic_fields',
      2,
      true,
      '{}'::jsonb,
      array['seller.display_name']::text[],
      jsonb_build_object(
        'section_title', 'Seller Details',
        'section_order', 2,
        'required_placeholders', array['seller.display_name', 'seller.registration_or_id'],
        'visibility_rules', jsonb_build_object(),
        'editable_by', array['principal', 'super_admin', 'admin', 'agent']
      )
    ),
    (
      'purchaser_details',
      'Purchaser Details',
      'dynamic_fields',
      3,
      true,
      '{}'::jsonb,
      array['buyer.display_name']::text[],
      jsonb_build_object(
        'section_title', 'Purchaser Details',
        'section_order', 3,
        'required_placeholders', array['buyer.display_name', 'buyer.registration_or_id', 'buyer.email'],
        'visibility_rules', jsonb_build_object(),
        'editable_by', array['principal', 'super_admin', 'admin', 'agent']
      )
    ),
    (
      'contractor_developer_details',
      'Contractor / Developer Details',
      'dynamic_fields',
      4,
      false,
      '{}'::jsonb,
      array['developer.company_name', 'developer.contact_email']::text[],
      jsonb_build_object(
        'section_title', 'Contractor / Developer Details',
        'section_order', 4,
        'required_placeholders', array['developer.company_name'],
        'visibility_rules', jsonb_build_object(),
        'editable_by', array['principal', 'super_admin', 'admin']
      )
    ),
    (
      'property_details',
      'Property Details',
      'dynamic_fields',
      5,
      true,
      '{}'::jsonb,
      array['property.unit_label', 'property.address', 'property.suburb', 'property.property_type']::text[],
      jsonb_build_object(
        'section_title', 'Property Details',
        'section_order', 5,
        'required_placeholders', array['property.unit_label', 'property.address'],
        'visibility_rules', jsonb_build_object(),
        'editable_by', array['principal', 'super_admin', 'admin', 'agent']
      )
    ),
    (
      'purchase_price',
      'Purchase Price',
      'dynamic_fields',
      6,
      true,
      '{}'::jsonb,
      array['transaction.purchase_price']::text[],
      jsonb_build_object(
        'section_title', 'Purchase Price',
        'section_order', 6,
        'required_placeholders', array['transaction.purchase_price'],
        'visibility_rules', jsonb_build_object(),
        'editable_by', array['principal', 'super_admin', 'admin', 'agent']
      )
    ),
    (
      'payment_terms_deposit',
      'Payment Terms / Deposit',
      'dynamic_fields',
      7,
      false,
      '{}'::jsonb,
      array['transaction.deposit_amount']::text[],
      jsonb_build_object(
        'section_title', 'Payment Terms / Deposit',
        'section_order', 7,
        'required_placeholders', array['transaction.deposit_amount'],
        'visibility_rules', jsonb_build_object(),
        'editable_by', array['principal', 'super_admin', 'admin', 'agent']
      )
    ),
    (
      'mortgage_finance',
      'Mortgage Finance',
      'conditional_clause',
      8,
      false,
      jsonb_build_object(
        'any',
        jsonb_build_array(
          jsonb_build_object('key', 'transaction.finance_type_raw', 'operator', 'in', 'value', jsonb_build_array('bond', 'combination', 'hybrid'))
        )
      ),
      array['transaction.finance_type', 'transaction.bond_amount']::text[],
      jsonb_build_object(
        'section_title', 'Mortgage Finance',
        'section_order', 8,
        'required_placeholders', array['transaction.finance_type'],
        'visibility_rules', jsonb_build_object(
          'any',
          jsonb_build_array(
            jsonb_build_object('key', 'transaction.finance_type_raw', 'operator', 'in', 'value', jsonb_build_array('bond', 'combination', 'hybrid'))
          )
        ),
        'editable_by', array['principal', 'super_admin', 'admin', 'agent']
      )
    ),
    (
      'additional_costs',
      'Additional Costs',
      'dynamic_fields',
      9,
      false,
      '{}'::jsonb,
      array['transaction.additional_costs_note']::text[],
      jsonb_build_object(
        'section_title', 'Additional Costs',
        'section_order', 9,
        'required_placeholders', array['transaction.additional_costs_note'],
        'visibility_rules', jsonb_build_object(),
        'editable_by', array['principal', 'super_admin', 'admin', 'agent']
      )
    ),
    (
      'seller_domicilium',
      'Seller Domicilium',
      'dynamic_fields',
      10,
      false,
      '{}'::jsonb,
      array['seller.domicilium_address']::text[],
      jsonb_build_object(
        'section_title', 'Seller Domicilium',
        'section_order', 10,
        'required_placeholders', array['seller.domicilium_address'],
        'visibility_rules', jsonb_build_object(),
        'editable_by', array['principal', 'super_admin', 'admin', 'agent']
      )
    ),
    (
      'purchaser_domicilium',
      'Purchaser Domicilium',
      'dynamic_fields',
      11,
      false,
      '{}'::jsonb,
      array['buyer.domicilium_address']::text[],
      jsonb_build_object(
        'section_title', 'Purchaser Domicilium',
        'section_order', 11,
        'required_placeholders', array['buyer.domicilium_address'],
        'visibility_rules', jsonb_build_object(),
        'editable_by', array['principal', 'super_admin', 'admin', 'agent']
      )
    ),
    (
      'selling_agent_details',
      'Selling Agent Details',
      'dynamic_fields',
      12,
      false,
      '{}'::jsonb,
      array['agent.display_name', 'agent.email']::text[],
      jsonb_build_object(
        'section_title', 'Selling Agent Details',
        'section_order', 12,
        'required_placeholders', array['agent.display_name'],
        'visibility_rules', jsonb_build_object(),
        'editable_by', array['principal', 'super_admin', 'admin']
      )
    ),
    (
      'conveyancer_details',
      'Conveyancer Details',
      'dynamic_fields',
      13,
      false,
      '{}'::jsonb,
      array['conveyancer.display_name', 'conveyancer.email']::text[],
      jsonb_build_object(
        'section_title', 'Conveyancer Details',
        'section_order', 13,
        'required_placeholders', array['conveyancer.display_name'],
        'visibility_rules', jsonb_build_object(),
        'editable_by', array['principal', 'super_admin', 'admin']
      )
    ),
    (
      'annexures',
      'Annexures',
      'annexure',
      14,
      false,
      '{}'::jsonb,
      array['annexures.list']::text[],
      jsonb_build_object(
        'section_title', 'Annexures',
        'section_order', 14,
        'required_placeholders', array['annexures.list'],
        'visibility_rules', jsonb_build_object(),
        'editable_by', array['principal', 'super_admin', 'admin']
      )
    ),
    (
      'building_contractor',
      'Building Contractor',
      'dynamic_fields',
      15,
      false,
      '{}'::jsonb,
      array['contractor.company_name', 'contractor.registration_number']::text[],
      jsonb_build_object(
        'section_title', 'Building Contractor',
        'section_order', 15,
        'required_placeholders', array['contractor.company_name'],
        'visibility_rules', jsonb_build_object(),
        'editable_by', array['principal', 'super_admin', 'admin']
      )
    ),
    (
      'signature_section',
      'Signature Section',
      'signature_zone',
      16,
      true,
      '{}'::jsonb,
      array['buyer.display_name', 'seller.display_name']::text[],
      jsonb_build_object(
        'section_title', 'Signature Section',
        'section_order', 16,
        'required_placeholders', array['buyer.display_name', 'seller.display_name'],
        'visibility_rules', jsonb_build_object(),
        'editable_by', array['principal', 'super_admin', 'admin']
      )
    ),
    (
      'standard_conditions',
      'Standard Conditions',
      'legal_text',
      17,
      true,
      '{}'::jsonb,
      array[]::text[],
      jsonb_build_object(
        'section_title', 'Standard Conditions',
        'section_order', 17,
        'required_placeholders', array[]::text[],
        'visibility_rules', jsonb_build_object(),
        'editable_by', array['principal', 'super_admin', 'admin']
      )
    ),
    (
      'direct_marketing',
      'Direct Marketing',
      'conditional_clause',
      18,
      false,
      '{}'::jsonb,
      array['buyer.marketing_opt_in']::text[],
      jsonb_build_object(
        'section_title', 'Direct Marketing',
        'section_order', 18,
        'required_placeholders', array['buyer.marketing_opt_in'],
        'visibility_rules', jsonb_build_object(),
        'editable_by', array['principal', 'super_admin', 'admin']
      )
    ),
    (
      'consumer_protection_act',
      'Consumer Protection Act',
      'legal_text',
      19,
      true,
      '{}'::jsonb,
      array[]::text[],
      jsonb_build_object(
        'section_title', 'Consumer Protection Act',
        'section_order', 19,
        'required_placeholders', array[]::text[],
        'visibility_rules', jsonb_build_object(),
        'editable_by', array['principal', 'super_admin', 'admin']
      )
    ),
    (
      'nhbrc_certificate',
      'NHBRC Certificate',
      'conditional_clause',
      20,
      false,
      '{}'::jsonb,
      array['property.nhbrc_certificate_number']::text[],
      jsonb_build_object(
        'section_title', 'NHBRC Certificate',
        'section_order', 20,
        'required_placeholders', array['property.nhbrc_certificate_number'],
        'visibility_rules', jsonb_build_object(),
        'editable_by', array['principal', 'super_admin', 'admin']
      )
    ),
    (
      'final_signatures',
      'Final Signatures',
      'signature_zone',
      21,
      true,
      '{}'::jsonb,
      array['buyer.display_name', 'seller.display_name']::text[],
      jsonb_build_object(
        'section_title', 'Final Signatures',
        'section_order', 21,
        'required_placeholders', array['buyer.display_name', 'seller.display_name'],
        'visibility_rules', jsonb_build_object(),
        'editable_by', array['principal', 'super_admin', 'admin']
      )
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

with mandate_template as (
  select t.id
  from public.document_packet_templates t
  where t.organisation_id is null
    and t.template_key = 'mandate_default_v1'
    and t.version_tag = 'v1'
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
      'header_branding',
      'Header / Branding',
      'metadata',
      1,
      true,
      '{}'::jsonb,
      array['organisation.name', 'organisation.logo_light_url', 'bridge.name']::text[],
      jsonb_build_object('section_title', 'Header / Branding', 'section_order', 1, 'required_placeholders', array['organisation.name', 'organisation.logo_light_url', 'bridge.name'], 'visibility_rules', jsonb_build_object(), 'editable_by', array['principal', 'super_admin', 'admin'])
    ),
    (
      'seller_identity',
      'Seller Identity',
      'dynamic_fields',
      2,
      true,
      '{}'::jsonb,
      array['seller.display_name']::text[],
      jsonb_build_object('section_title', 'Seller Identity', 'section_order', 2, 'required_placeholders', array['seller.display_name', 'seller.registration_or_id'], 'visibility_rules', jsonb_build_object(), 'editable_by', array['principal', 'super_admin', 'admin', 'agent'])
    ),
    (
      'property_details',
      'Property Details',
      'dynamic_fields',
      3,
      true,
      '{}'::jsonb,
      array['property.address', 'property.property_type']::text[],
      jsonb_build_object('section_title', 'Property Details', 'section_order', 3, 'required_placeholders', array['property.address'], 'visibility_rules', jsonb_build_object(), 'editable_by', array['principal', 'super_admin', 'admin', 'agent'])
    ),
    (
      'mandate_type',
      'Mandate Type',
      'dynamic_fields',
      4,
      true,
      '{}'::jsonb,
      array['mandate.type']::text[],
      jsonb_build_object('section_title', 'Mandate Type', 'section_order', 4, 'required_placeholders', array['mandate.type'], 'visibility_rules', jsonb_build_object(), 'editable_by', array['principal', 'super_admin', 'admin', 'agent'])
    ),
    (
      'mandate_term',
      'Mandate Term',
      'dynamic_fields',
      5,
      false,
      '{}'::jsonb,
      array['mandate.start_date', 'mandate.end_date']::text[],
      jsonb_build_object('section_title', 'Mandate Term', 'section_order', 5, 'required_placeholders', array['mandate.start_date', 'mandate.end_date'], 'visibility_rules', jsonb_build_object(), 'editable_by', array['principal', 'super_admin', 'admin', 'agent'])
    ),
    (
      'asking_price',
      'Asking Price',
      'dynamic_fields',
      6,
      false,
      '{}'::jsonb,
      array['mandate.asking_price']::text[],
      jsonb_build_object('section_title', 'Asking Price', 'section_order', 6, 'required_placeholders', array['mandate.asking_price'], 'visibility_rules', jsonb_build_object(), 'editable_by', array['principal', 'super_admin', 'admin', 'agent'])
    ),
    (
      'commission_terms',
      'Commission Terms',
      'dynamic_fields',
      7,
      true,
      '{}'::jsonb,
      array['mandate.commission_structure', 'mandate.commission_percent', 'mandate.commission_amount', 'mandate.vat_handling']::text[],
      jsonb_build_object('section_title', 'Commission Terms', 'section_order', 7, 'required_placeholders', array['mandate.commission_structure'], 'visibility_rules', jsonb_build_object(), 'editable_by', array['principal', 'super_admin', 'admin'])
    ),
    (
      'marketing_permissions',
      'Marketing Permissions',
      'conditional_clause',
      8,
      false,
      '{}'::jsonb,
      array['mandate.marketing_permissions']::text[],
      jsonb_build_object('section_title', 'Marketing Permissions', 'section_order', 8, 'required_placeholders', array['mandate.marketing_permissions'], 'visibility_rules', jsonb_build_object(), 'editable_by', array['principal', 'super_admin', 'admin', 'agent'])
    ),
    (
      'agent_agency_details',
      'Agent / Agency Details',
      'dynamic_fields',
      9,
      false,
      '{}'::jsonb,
      array['agent.display_name', 'agent.email', 'organisation.name']::text[],
      jsonb_build_object('section_title', 'Agent / Agency Details', 'section_order', 9, 'required_placeholders', array['organisation.name'], 'visibility_rules', jsonb_build_object(), 'editable_by', array['principal', 'super_admin', 'admin'])
    ),
    (
      'property_access_instructions',
      'Property Access Instructions',
      'dynamic_fields',
      10,
      false,
      '{}'::jsonb,
      array['mandate.access_instructions']::text[],
      jsonb_build_object('section_title', 'Property Access Instructions', 'section_order', 10, 'required_placeholders', array['mandate.access_instructions'], 'visibility_rules', jsonb_build_object(), 'editable_by', array['principal', 'super_admin', 'admin', 'agent'])
    ),
    (
      'seller_declarations',
      'Seller Declarations',
      'legal_text',
      11,
      true,
      '{}'::jsonb,
      array[]::text[],
      jsonb_build_object('section_title', 'Seller Declarations', 'section_order', 11, 'required_placeholders', array[]::text[], 'visibility_rules', jsonb_build_object(), 'editable_by', array['principal', 'super_admin', 'admin'])
    ),
    (
      'special_conditions',
      'Special Conditions',
      'dynamic_fields',
      12,
      false,
      '{}'::jsonb,
      array['document.special_conditions']::text[],
      jsonb_build_object('section_title', 'Special Conditions', 'section_order', 12, 'required_placeholders', array['document.special_conditions'], 'visibility_rules', jsonb_build_object(), 'editable_by', array['principal', 'super_admin', 'admin', 'agent'])
    ),
    (
      'legal_terms',
      'Legal Terms',
      'legal_text',
      13,
      true,
      '{}'::jsonb,
      array[]::text[],
      jsonb_build_object('section_title', 'Legal Terms', 'section_order', 13, 'required_placeholders', array[]::text[], 'visibility_rules', jsonb_build_object(), 'editable_by', array['principal', 'super_admin', 'admin'])
    ),
    (
      'signature_section',
      'Signature Section',
      'signature_zone',
      14,
      true,
      '{}'::jsonb,
      array['seller.display_name']::text[],
      jsonb_build_object('section_title', 'Signature Section', 'section_order', 14, 'required_placeholders', array['seller.display_name'], 'visibility_rules', jsonb_build_object(), 'editable_by', array['principal', 'super_admin', 'admin'])
    ),
    (
      'annexures',
      'Annexures',
      'annexure',
      15,
      false,
      '{}'::jsonb,
      array['annexures.list']::text[],
      jsonb_build_object('section_title', 'Annexures', 'section_order', 15, 'required_placeholders', array['annexures.list'], 'visibility_rules', jsonb_build_object(), 'editable_by', array['principal', 'super_admin', 'admin'])
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

-- Optional placeholder registry seed (for stricter template-aware validation introspection)
insert into public.document_placeholder_registry (
  packet_type,
  placeholder_key,
  entity_scope,
  data_type,
  description,
  is_required_default,
  is_active
)
values
  ('otp', 'buyer.display_name', 'buyer', 'text', 'Purchaser display name', true, true),
  ('otp', 'buyer.registration_or_id', 'buyer', 'text', 'Purchaser ID / registration', true, true),
  ('otp', 'seller.display_name', 'seller', 'text', 'Seller display name', true, true),
  ('otp', 'property.address', 'property', 'text', 'Property physical address', true, true),
  ('otp', 'transaction.purchase_price', 'transaction', 'currency', 'Transaction purchase price', true, true),
  ('otp', 'transaction.deposit_amount', 'transaction', 'currency', 'Deposit amount', true, true),
  ('otp', 'conveyancer.display_name', 'custom', 'text', 'Assigned conveyancer', false, true),
  ('otp', 'commission.gross_commission_amount', 'transaction', 'currency', 'Gross commission amount', false, true),
  ('mandate', 'seller.display_name', 'seller', 'text', 'Seller display name', true, true),
  ('mandate', 'seller.registration_or_id', 'seller', 'text', 'Seller ID / registration', true, true),
  ('mandate', 'property.address', 'property', 'text', 'Property address', true, true),
  ('mandate', 'mandate.type', 'custom', 'text', 'Mandate type', true, true),
  ('mandate', 'mandate.start_date', 'custom', 'date', 'Mandate start date', true, true),
  ('mandate', 'mandate.end_date', 'custom', 'date', 'Mandate expiry date', true, true),
  ('mandate', 'mandate.asking_price', 'custom', 'currency', 'Mandate asking price', true, true),
  ('mandate', 'mandate.commission_structure', 'custom', 'text', 'Mandate commission structure', true, true)
on conflict (packet_type, placeholder_key)
do update set
  entity_scope = excluded.entity_scope,
  data_type = excluded.data_type,
  description = excluded.description,
  is_required_default = excluded.is_required_default,
  is_active = excluded.is_active,
  updated_at = now();

commit;
