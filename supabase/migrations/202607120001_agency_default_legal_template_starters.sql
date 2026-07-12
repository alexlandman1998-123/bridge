begin;

-- Keep the residential agency legal-template module useful out of the box:
-- global mandate/OTP defaults are shared base templates, and agencies edit
-- their own organisation-owned copies from these starters.

create unique index if not exists document_packet_templates_global_key_version_unique
on public.document_packet_templates (template_key, version_tag)
where organisation_id is null;

create unique index if not exists document_template_sections_template_key_unique
on public.document_template_sections (template_id, section_key);

insert into public.document_packet_templates (
  organisation_id,
  module_type,
  packet_type,
  template_key,
  template_label,
  template_format,
  version_tag,
  description,
  status,
  is_default,
  is_active,
  metadata_json,
  published_at
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
    'Default editable OTP template for agency transactions.',
    'published',
    true,
    true,
    jsonb_build_object(
      'template_scope', 'global_default',
      'document_family', 'otp',
      'preview_layout', 'three_panel_packet',
      'render_mode', 'legacy_docx',
      'starter_template', 'arch9_standard_default',
      'template_family', 'standard_legal_template',
      'default_template_source', 'arch9_agency_default',
      'editable_copy_mode', 'auto_agency_version',
      'lifecycle_status', 'published',
      'document_kind', 'standard',
      'documentKind', 'standard',
      'preferred_document_kind', 'standard',
      'document_kind_label', 'Standard document',
      'last_render_validation', jsonb_build_object(
        'renderable', true,
        'sectionCount', 12,
        'blockingIssues', '[]'::jsonb,
        'warnings', '[]'::jsonb,
        'validatedAt', now()
      )
    ),
    now()
  ),
  (
    null,
    'agency',
    'mandate',
    'mandate_default_v1',
    'Mandate Agreement · Default',
    'html',
    'v1',
    'Default editable seller mandate template for agency workflows.',
    'published',
    true,
    true,
    jsonb_build_object(
      'template_scope', 'global_default',
      'document_family', 'mandate',
      'preview_layout', 'three_panel_packet',
      'render_mode', 'native_structured',
      'native_renderer_version', '2026.05.14',
      'starter_template', 'arch9_standard_default',
      'template_family', 'standard_legal_template',
      'default_template_source', 'arch9_agency_default',
      'editable_copy_mode', 'auto_agency_version',
      'lifecycle_status', 'published',
      'document_kind', 'standard',
      'documentKind', 'standard',
      'preferred_document_kind', 'standard',
      'document_kind_label', 'Standard document',
      'last_render_validation', jsonb_build_object(
        'renderable', true,
        'sectionCount', 10,
        'blockingIssues', '[]'::jsonb,
        'warnings', '[]'::jsonb,
        'validatedAt', now()
      )
    ),
    now()
  )
on conflict (template_key, version_tag) where organisation_id is null
do update set
  module_type = excluded.module_type,
  packet_type = excluded.packet_type,
  template_label = excluded.template_label,
  template_format = excluded.template_format,
  description = excluded.description,
  status = 'published',
  is_default = true,
  is_active = true,
  metadata_json = coalesce(public.document_packet_templates.metadata_json, '{}'::jsonb) || excluded.metadata_json,
  published_at = coalesce(public.document_packet_templates.published_at, excluded.published_at, now()),
  updated_at = now();

with target_templates as (
  select id
  from public.document_packet_templates
  where organisation_id is null
    and template_key in ('otp_default_v1', 'mandate_default_v1')
    and version_tag = 'v1'
)
delete from public.document_template_sections section
using target_templates target
where section.template_id = target.id;

with target_templates as (
  select id, template_key
  from public.document_packet_templates
  where organisation_id is null
    and template_key in ('otp_default_v1', 'mandate_default_v1')
    and version_tag = 'v1'
),
section_seed as (
  select *
  from (
    values
      (
        'mandate_default_v1',
        'introduction_purpose',
        'Introduction and Purpose',
        'legal_text',
        0,
        true,
        '{}'::jsonb,
        array['seller_full_name', 'agency_legal_name', 'agent_full_name', 'agent_ffc_number']::text[],
        $legal$MANDATE AGREEMENT

This mandate records the appointment of {{agency_legal_name}} and {{agent_full_name}} to market and negotiate the sale of the property described in this document.

The Seller confirms that the information supplied for this mandate is true and that the Seller has authority to grant the mandate.$legal$
      ),
      (
        'mandate_default_v1',
        'parties',
        'Parties',
        'dynamic_fields',
        1,
        true,
        '{}'::jsonb,
        array['seller_full_name', 'seller_id_number', 'seller_email', 'seller_phone', 'seller_entity_type', 'seller_domicilium_address', 'organisation_name', 'agent_full_name', 'agent_email', 'agent_phone']::text[],
        $legal$SELLER

Seller: {{seller_full_name}}
Identity / Registration Number: {{seller_id_number}}
Entity Type: {{seller_entity_type}}
Domicilium Address: {{seller_domicilium_address}}
Email: {{seller_email}}
Telephone: {{seller_phone}}

AGENCY AND AGENT

Agency: {{organisation_name}}
Agent: {{agent_full_name}}
Agent Email: {{agent_email}}
Agent Phone: {{agent_phone}}$legal$
      ),
      (
        'mandate_default_v1',
        'property_details',
        'Property Details',
        'dynamic_fields',
        2,
        true,
        '{}'::jsonb,
        array['property_address', 'property_display_address', 'property_suburb', 'property_city', 'property_type', 'property_unit_number', 'property_section_number', 'sectional_title_number', 'property_complex_name', 'property_estate_name']::text[],
        $legal$PROPERTY

Address: {{property_address}}
Display Address: {{property_display_address}}
Suburb / City: {{property_suburb}} {{property_city}}
Property Type: {{property_type}}
Unit / Section: {{property_unit_number}} {{property_section_number}}
Scheme / Estate: {{property_complex_name}} {{property_estate_name}}
Sectional Title Number: {{sectional_title_number}}$legal$
      ),
      (
        'mandate_default_v1',
        'mandate_terms',
        'Mandate Terms',
        'legal_text',
        3,
        true,
        '{}'::jsonb,
        array['mandate_type', 'mandate_start_date', 'mandate_end_date', 'mandate_authority_granted', 'mandate_access_instructions']::text[],
        $legal$MANDATE TERMS

Mandate Type: {{mandate_type}}
Start Date: {{mandate_start_date}}
End Date: {{mandate_end_date}}

The Seller grants the Agency authority to market the Property, introduce prospective purchasers, arrange viewings, receive offers, and assist with transaction administration according to the mandate type selected above.

Authority Granted: {{mandate_authority_granted}}
Access Instructions: {{mandate_access_instructions}}$legal$
      ),
      (
        'mandate_default_v1',
        'commission_terms',
        'Commission Terms',
        'dynamic_fields',
        4,
        true,
        '{}'::jsonb,
        array['commission_structure', 'mandate_commission_percent', 'mandate_commission_amount', 'vat_handling', 'asking_price']::text[],
        $legal$COMMISSION

Asking Price: {{asking_price}}
Commission Structure: {{commission_structure}}
Commission Percentage: {{mandate_commission_percent}}
Commission Amount: {{mandate_commission_amount}}
VAT Treatment: {{vat_handling}}

Commission is earned and payable according to the agreed commission structure when the Seller accepts an offer introduced by the Agency or where commission is otherwise due under this mandate.$legal$
      ),
      (
        'mandate_default_v1',
        'marketing_listing_terms',
        'Marketing / Listing Terms',
        'dynamic_fields',
        5,
        false,
        '{}'::jsonb,
        array['mandate_marketing_permissions', 'mandate_access_instructions']::text[],
        $legal$MARKETING AND LISTING

Marketing Permissions: {{mandate_marketing_permissions}}
Viewing / Access Arrangements: {{mandate_access_instructions}}

The Agency may prepare marketing material, publish the listing on approved channels, contact prospective purchasers, and present the Property in a professional manner consistent with the Seller instructions.$legal$
      ),
      (
        'mandate_default_v1',
        'special_conditions',
        'Special Conditions',
        'legal_text',
        6,
        false,
        '{}'::jsonb,
        array['special_conditions', 'annexures_list']::text[],
        $legal$SPECIAL CONDITIONS

{{special_conditions}}

Annexures:
{{annexures_list}}$legal$
      ),
      (
        'mandate_default_v1',
        'general_terms',
        'General Legal Terms',
        'legal_text',
        7,
        true,
        '{}'::jsonb,
        array['document_reference']::text[],
        $legal$GENERAL TERMS

This mandate is governed by South African law. The parties choose their recorded addresses as domicilium for notices unless changed in writing.

No amendment, cancellation or waiver is valid unless recorded in writing and accepted by the parties. If any provision is unenforceable, the remaining provisions continue to apply.$legal$
      ),
      (
        'mandate_default_v1',
        'popia_fica',
        'POPIA and FICA',
        'legal_text',
        8,
        true,
        '{}'::jsonb,
        array['seller_full_name']::text[],
        $legal$POPIA AND FICA

The Seller consents to the processing of personal information reasonably required for marketing, mandate administration, FICA verification, transaction communication, record keeping and related property services.$legal$
      ),
      (
        'mandate_default_v1',
        'signature_pages',
        'Signature Pages',
        'signature_zone',
        9,
        true,
        '{}'::jsonb,
        array['seller_full_name', 'seller_signature', 'seller_initials', 'signed_date', 'witness_signature', 'organisation_name', 'agent_full_name', 'agent_ffc_number']::text[],
        $legal$SIGNATURES

Seller: {{seller_full_name}}
Signature: {{seller_signature}}
Initials: {{seller_initials}}
Date: {{signed_date}}

Witness: {{witness_signature}}

Agency: {{organisation_name}}
Agent: {{agent_full_name}}
FFC Number: {{agent_ffc_number}}$legal$
      ),
      (
        'otp_default_v1',
        'cover_page',
        'Cover Page',
        'legal_text',
        0,
        true,
        '{}'::jsonb,
        array['property_address', 'agent_full_name', 'organisation_name', 'document_reference', 'transaction_reference']::text[],
        $legal$OFFER TO PURCHASE

Property Address: {{property_address}}
Agent: {{agent_full_name}}
Agency: {{organisation_name}}
Document Reference: {{document_reference}}
Transaction Reference: {{transaction_reference}}

This Offer to Purchase becomes a deed of sale when accepted by the Seller in writing. The schedules, standard terms, special conditions and annexures form one agreement.$legal$
      ),
      (
        'otp_default_v1',
        'parties',
        'Parties',
        'dynamic_fields',
        1,
        true,
        '{}'::jsonb,
        array['buyer_full_name', 'buyer_id_number', 'buyer_email', 'buyer_phone', 'buyer_entity_type', 'seller_full_name', 'seller_id_number', 'seller_email', 'seller_phone', 'seller_entity_type']::text[],
        $legal$PURCHASER

Purchaser: {{buyer_full_name}}
Identity / Registration Number: {{buyer_id_number}}
Entity Type: {{buyer_entity_type}}
Email: {{buyer_email}}
Telephone: {{buyer_phone}}

SELLER

Seller: {{seller_full_name}}
Identity / Registration Number: {{seller_id_number}}
Entity Type: {{seller_entity_type}}
Email: {{seller_email}}
Telephone: {{seller_phone}}$legal$
      ),
      (
        'otp_default_v1',
        'property_details',
        'Property Details',
        'dynamic_fields',
        2,
        true,
        '{}'::jsonb,
        array['property_address', 'property_display_address', 'property_suburb', 'property_city', 'property_type', 'erf_number', 'property_unit_number', 'property_section_number', 'sectional_title_number', 'property_complex_name', 'property_estate_name']::text[],
        $legal$PROPERTY

Address: {{property_address}}
Display Address: {{property_display_address}}
Suburb / City: {{property_suburb}} {{property_city}}
Property Type: {{property_type}}
Erf Number: {{erf_number}}
Unit / Section: {{property_unit_number}} {{property_section_number}}
Scheme / Estate: {{property_complex_name}} {{property_estate_name}}
Sectional Title Number: {{sectional_title_number}}$legal$
      ),
      (
        'otp_default_v1',
        'purchase_price',
        'Purchase Price',
        'dynamic_fields',
        3,
        true,
        '{}'::jsonb,
        array['purchase_price', 'deposit_amount', 'finance_type', 'bond_amount', 'cash_amount']::text[],
        $legal$PURCHASE PRICE

Purchase Price: {{purchase_price}}
Deposit: {{deposit_amount}}
Finance Type: {{finance_type}}
Bond Amount: {{bond_amount}}
Cash Contribution: {{cash_amount}}

The Purchase Price is payable in accordance with the accepted offer, guarantees, bond approval, cash undertakings and conveyancer requirements.$legal$
      ),
      (
        'otp_default_v1',
        'occupation_transfer',
        'Occupation and Transfer',
        'dynamic_fields',
        4,
        true,
        '{}'::jsonb,
        array['occupation_date', 'transfer_date']::text[],
        $legal$OCCUPATION AND TRANSFER

Occupation Date: {{occupation_date}}
Expected Transfer Date: {{transfer_date}}

Risk, benefits and obligations transfer according to the final agreement terms and applicable conveyancing requirements.$legal$
      ),
      (
        'otp_default_v1',
        'suspensive_conditions',
        'Suspensive Conditions',
        'dynamic_fields',
        5,
        false,
        '{}'::jsonb,
        array['suspensive_conditions', 'finance_type', 'bond_amount']::text[],
        $legal$SUSPENSIVE CONDITIONS

Finance Type: {{finance_type}}
Bond Amount: {{bond_amount}}

{{suspensive_conditions}}

If a suspensive condition is not fulfilled or waived within the agreed period, the parties must follow the consequence recorded in the agreement.$legal$
      ),
      (
        'otp_default_v1',
        'fixtures_fittings',
        'Fixtures and Fittings',
        'legal_text',
        6,
        true,
        '{}'::jsonb,
        array['special_conditions']::text[],
        $legal$FIXTURES AND FITTINGS

The Property is sold together with fixtures and fittings of a permanent nature unless expressly excluded in Special Conditions or an annexure.$legal$
      ),
      (
        'otp_default_v1',
        'commission_terms',
        'Commission Terms',
        'dynamic_fields',
        7,
        true,
        '{}'::jsonb,
        array['organisation_name', 'gross_commission_percentage', 'gross_commission_amount', 'agency_commission_amount', 'agent_commission_amount']::text[],
        $legal$COMMISSION

Agency: {{organisation_name}}
Gross Commission Percentage: {{gross_commission_percentage}}
Gross Commission Amount: {{gross_commission_amount}}
Agency Commission Amount: {{agency_commission_amount}}
Agent Commission Amount: {{agent_commission_amount}}

Commission is earned and payable according to the accepted offer, mandate and applicable agency agreement.$legal$
      ),
      (
        'otp_default_v1',
        'warranties_capacity',
        'Warranties and Capacity',
        'legal_text',
        8,
        true,
        '{}'::jsonb,
        array['buyer_entity_type', 'seller_entity_type']::text[],
        $legal$WARRANTIES AND CAPACITY

Each party warrants that they have the necessary capacity and authority to sign this agreement. Legal entities must ensure the signatory is duly authorised.$legal$
      ),
      (
        'otp_default_v1',
        'special_conditions',
        'Special Conditions',
        'dynamic_fields',
        9,
        false,
        '{}'::jsonb,
        array['special_conditions', 'annexures_list']::text[],
        $legal$SPECIAL CONDITIONS

{{special_conditions}}

Annexures:
{{annexures_list}}$legal$
      ),
      (
        'otp_default_v1',
        'general_terms',
        'General Legal Terms',
        'legal_text',
        10,
        true,
        '{}'::jsonb,
        array['document_reference']::text[],
        $legal$GENERAL TERMS

The parties choose their recorded addresses for notices and consent to the jurisdiction recorded in the final agreement. No amendment or cancellation is valid unless reduced to writing and signed or accepted by the parties as required.

The parties consent to processing of personal information required for conveyancing, finance, verification, communication and transaction administration.$legal$
      ),
      (
        'otp_default_v1',
        'signature_pages',
        'Signature Pages',
        'signature_zone',
        11,
        true,
        '{}'::jsonb,
        array['buyer_full_name', 'buyer_signature', 'buyer_initials', 'seller_full_name', 'seller_signature', 'seller_initials', 'signed_date', 'witness_signature', 'organisation_name', 'agent_full_name', 'agent_ffc_number']::text[],
        $legal$SIGNATURES

Purchaser: {{buyer_full_name}}
Signature: {{buyer_signature}}
Initials: {{buyer_initials}}
Date: {{signed_date}}

Seller: {{seller_full_name}}
Signature: {{seller_signature}}
Initials: {{seller_initials}}
Date: {{signed_date}}

Witness: {{witness_signature}}

Agency: {{organisation_name}}
Agent: {{agent_full_name}}
FFC Number: {{agent_ffc_number}}$legal$
      )
  ) as seed(
    template_key,
    section_key,
    section_label,
    section_type,
    sort_order,
    is_required,
    condition_json,
    placeholder_keys,
    legal_text
  )
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
  target.id,
  seed.section_key,
  seed.section_label,
  seed.section_type,
  seed.sort_order,
  seed.is_required,
  false,
  seed.condition_json,
  seed.placeholder_keys,
  seed.legal_text,
  jsonb_build_object(
    'section_title', seed.section_label,
    'section_order', seed.sort_order,
    'required_placeholders', seed.placeholder_keys,
    'editable_by', array['principal', 'super_admin', 'admin', 'agent'],
    'default_template_source', 'arch9_agency_default'
  )
from section_seed seed
join target_templates target on target.template_key = seed.template_key
on conflict (template_id, section_key)
do update set
  section_label = excluded.section_label,
  section_type = excluded.section_type,
  sort_order = excluded.sort_order,
  is_required = excluded.is_required,
  is_repeatable = excluded.is_repeatable,
  condition_json = excluded.condition_json,
  placeholder_keys = excluded.placeholder_keys,
  legal_text = excluded.legal_text,
  metadata_json = excluded.metadata_json,
  updated_at = now();

commit;
