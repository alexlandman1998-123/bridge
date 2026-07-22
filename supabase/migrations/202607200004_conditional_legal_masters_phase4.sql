begin;

-- Phase 4 turns the two global agency starters into complete conditional
-- masters. Organisation copies inherit these sections through the existing
-- native-template copy/revision workflow; scenario facts never select a
-- different template row.

-- Published B4 revisions are immutable. Create a draft v2 successor for each
-- global starter, copy its existing sections, then enrich and publish the new
-- revision without rewriting any packet's historical v1 source.
create temporary table phase4_conditional_master_revisions (
  source_template_id uuid primary key,
  target_template_id uuid not null unique,
  packet_type text not null
) on commit drop;

insert into phase4_conditional_master_revisions (source_template_id, target_template_id, packet_type)
select id, gen_random_uuid(), packet_type
from public.document_packet_templates
where organisation_id is null
  and template_key in ('mandate_default_v1', 'otp_default_v1')
  and version_tag = 'v1'
  and status = 'published'
  and is_active = true;

insert into public.document_packet_templates (
  id, organisation_id, module_type, packet_type, template_key, template_label,
  template_format, template_storage_bucket, template_storage_path, template_file_name,
  version_tag, description, is_default, is_active, metadata_json,
  created_by, created_at, updated_at, status, document_model,
  canonical_contract_version, definition_schema_version, definition_json,
  revision_root_template_id, revision_parent_template_id, revision_number
)
select
  revision.target_template_id,
  source.organisation_id,
  source.module_type,
  source.packet_type,
  source.template_key,
  source.template_label,
  'structured',
  null,
  null,
  null,
  'v2',
  source.description,
  false,
  false,
  coalesce(source.metadata_json, '{}'::jsonb),
  source.created_by,
  now(),
  now(),
  'draft',
  source.document_model,
  source.canonical_contract_version,
  source.definition_schema_version,
  '{}'::jsonb,
  coalesce(source.revision_root_template_id, source.id),
  source.id,
  source.revision_number + 1
from phase4_conditional_master_revisions revision
join public.document_packet_templates source on source.id = revision.source_template_id;

insert into public.document_template_sections (
  template_id, section_key, section_label, section_type, sort_order,
  is_required, is_repeatable, condition_json, placeholder_keys, legal_text, metadata_json
)
select
  revision.target_template_id,
  section.section_key,
  section.section_label,
  section.section_type,
  section.sort_order,
  section.is_required,
  section.is_repeatable,
  section.condition_json,
  section.placeholder_keys,
  section.legal_text,
  section.metadata_json
from phase4_conditional_master_revisions revision
join public.document_template_sections section on section.template_id = revision.source_template_id;

update public.document_packet_templates
set
  template_format = 'structured',
  template_storage_bucket = null,
  template_storage_path = null,
  template_file_name = null,
  status = 'draft',
  is_active = false,
  is_default = false,
  metadata_json = coalesce(metadata_json, '{}'::jsonb) || jsonb_build_object(
    'conditional_master', true,
    'conditional_master_version', 'conditional-master-v1',
    'scenario_resolver_version', 'canonical_legal_document_scenario_v1',
    'core_condition_rules_locked', true,
    'starter_content_version', 'conditional-master-v1',
    'render_mode', 'native_structured',
    'native_template', true,
    'inherit_organisation_branding', true,
    'conditional_pack_keys', case packet_type
      when 'mandate' then jsonb_build_array(
        'seller_individual_capacity_pack', 'seller_company_authority_pack', 'seller_trust_authority_pack',
        'seller_spouse_consent_pack', 'property_full_title_pack', 'property_sectional_title_pack'
      )
      else jsonb_build_array(
        'buyer_individual_capacity_pack', 'buyer_company_authority_pack', 'buyer_trust_authority_pack', 'buyer_spouse_consent_pack',
        'seller_individual_capacity_pack', 'seller_company_authority_pack', 'seller_trust_authority_pack', 'seller_spouse_consent_pack',
        'property_full_title_pack', 'property_sectional_title_pack',
        'bond_finance_pack', 'cash_sale_pack', 'cash_contribution_pack'
      )
    end,
    'default_signer_roles', case packet_type
      when 'mandate' then jsonb_build_array(
        jsonb_build_object('role', 'seller', 'label', 'Seller', 'required', true, 'order', 0),
        jsonb_build_object('role', 'agent', 'label', 'Estate Agent', 'required', true, 'order', 1),
        jsonb_build_object('role', 'seller_spouse', 'label', 'Seller spouse / co-signer', 'required', false, 'order', 2,
          'condition_json', jsonb_build_object('enabled', true, 'rule', jsonb_build_object('field', 'seller_spouse_consent_required', 'operator', 'equals', 'value', 'Yes'))),
        jsonb_build_object('role', 'witness', 'label', 'Witness', 'required', false, 'order', 3)
      )
      else jsonb_build_array(
        jsonb_build_object('role', 'purchaser_1', 'label', 'Purchaser', 'required', true, 'order', 0),
        jsonb_build_object('role', 'seller', 'label', 'Seller', 'required', true, 'order', 1),
        jsonb_build_object('role', 'agent', 'label', 'Estate Agent', 'required', false, 'order', 2),
        jsonb_build_object('role', 'buyer_spouse', 'label', 'Purchaser spouse / co-signer', 'required', false, 'order', 3,
          'condition_json', jsonb_build_object('enabled', true, 'rule', jsonb_build_object('field', 'buyer_spouse_consent_required', 'operator', 'equals', 'value', 'Yes'))),
        jsonb_build_object('role', 'seller_spouse', 'label', 'Seller spouse / co-signer', 'required', false, 'order', 4,
          'condition_json', jsonb_build_object('enabled', true, 'rule', jsonb_build_object('field', 'seller_spouse_consent_required', 'operator', 'equals', 'value', 'Yes'))),
        jsonb_build_object('role', 'witness', 'label', 'Witness', 'required', false, 'order', 5)
      )
    end
  ),
  updated_at = now()
where organisation_id is null
  and template_key in ('mandate_default_v1', 'otp_default_v1')
  and version_tag = 'v2';

with masters as (
  select id, packet_type
  from public.document_packet_templates
  where organisation_id is null
    and template_key in ('mandate_default_v1', 'otp_default_v1')
    and version_tag = 'v2'
), pack_seed as (
  select * from (values
    (array['mandate','otp']::text[], 'seller_individual_capacity_pack', 'Seller Individual Capacity Pack', 20,
      'seller_entity_type', 'equals', jsonb_build_array('individual'),
      array['seller_entity_type','seller_marital_status','seller_spouse_consent_required']::text[],
      $legal$SELLER INDIVIDUAL CAPACITY

The Seller warrants that the recorded marital status is correct and that the Seller has full contractual capacity.

Seller Marital Status
{{seller_marital_status}}

Spouse Consent Required
{{seller_spouse_consent_required}}$legal$),
    (array['mandate','otp']::text[], 'seller_company_authority_pack', 'Seller Company Authority Pack', 21,
      'seller_entity_type', 'in', jsonb_build_array('company','close_corporation'),
      array['seller_entity_type','seller_company_registration_number','seller_representative_name','seller_representative_capacity','seller_resolution_date','seller_authority_basis']::text[],
      $legal$SELLER COMPANY AUTHORITY

Where the Seller is a company or close corporation, the signatory warrants that they are duly authorised to bind the Seller.

Registration Number: {{seller_company_registration_number}}
Representative: {{seller_representative_name}}
Capacity: {{seller_representative_capacity}}
Resolution Date: {{seller_resolution_date}}
Authority Basis: {{seller_authority_basis}}$legal$),
    (array['mandate','otp']::text[], 'seller_trust_authority_pack', 'Seller Trust Authority Pack', 22,
      'seller_entity_type', 'equals', jsonb_build_array('trust'),
      array['seller_entity_type','seller_trust_registration_number','seller_trustee_names','seller_representative_name','seller_representative_capacity','seller_authority_basis']::text[],
      $legal$SELLER TRUST AUTHORITY

The trustees or authorised representative warrant that the trust is duly authorised to enter into this document.

Trust Registration Number: {{seller_trust_registration_number}}
Trustees: {{seller_trustee_names}}
Representative: {{seller_representative_name}}
Capacity: {{seller_representative_capacity}}
Authority Basis: {{seller_authority_basis}}$legal$),
    (array['mandate','otp']::text[], 'seller_spouse_consent_pack', 'Seller Spouse Consent Pack', 23,
      'seller_spouse_consent_required', 'equals', jsonb_build_array('Yes'),
      array['seller_spouse_consent_required','seller_spouse_full_name','seller_spouse_id_number','seller_spouse_email']::text[],
      $legal$SELLER SPOUSE CONSENT

The Seller spouse recorded below consents to this document and will sign where required.

Spouse: {{seller_spouse_full_name}}
ID Number: {{seller_spouse_id_number}}
Email: {{seller_spouse_email}}$legal$),
    (array['otp']::text[], 'buyer_individual_capacity_pack', 'Buyer Individual Capacity Pack', 10,
      'buyer_entity_type', 'equals', jsonb_build_array('individual'),
      array['buyer_entity_type','buyer_marital_status','buyer_spouse_consent_required']::text[],
      $legal$PURCHASER INDIVIDUAL CAPACITY

The Purchaser warrants that the recorded marital status is correct and that the Purchaser has full contractual capacity.

Purchaser Marital Status: {{buyer_marital_status}}
Spouse Consent Required: {{buyer_spouse_consent_required}}$legal$),
    (array['otp']::text[], 'buyer_company_authority_pack', 'Buyer Company Authority Pack', 11,
      'buyer_entity_type', 'in', jsonb_build_array('company','close_corporation'),
      array['buyer_entity_type','buyer_company_registration_number','buyer_representative_name','buyer_representative_capacity','buyer_resolution_date','buyer_authority_basis']::text[],
      $legal$PURCHASER COMPANY AUTHORITY

Where the Purchaser is a company or close corporation, the signatory warrants that they are duly authorised to bind the Purchaser.

Registration Number: {{buyer_company_registration_number}}
Representative: {{buyer_representative_name}}
Capacity: {{buyer_representative_capacity}}
Resolution Date: {{buyer_resolution_date}}
Authority Basis: {{buyer_authority_basis}}$legal$),
    (array['otp']::text[], 'buyer_trust_authority_pack', 'Buyer Trust Authority Pack', 12,
      'buyer_entity_type', 'equals', jsonb_build_array('trust'),
      array['buyer_entity_type','buyer_trust_registration_number','buyer_trustee_names','buyer_representative_name','buyer_representative_capacity','buyer_authority_basis']::text[],
      $legal$PURCHASER TRUST AUTHORITY

The trustees or authorised representative warrant that the trust is duly authorised to enter into this agreement.

Trust Registration Number: {{buyer_trust_registration_number}}
Trustees: {{buyer_trustee_names}}
Representative: {{buyer_representative_name}}
Capacity: {{buyer_representative_capacity}}
Authority Basis: {{buyer_authority_basis}}$legal$),
    (array['otp']::text[], 'buyer_spouse_consent_pack', 'Buyer Spouse Consent Pack', 13,
      'buyer_spouse_consent_required', 'equals', jsonb_build_array('Yes'),
      array['buyer_spouse_consent_required','buyer_spouse_full_name','buyer_spouse_id_number','buyer_spouse_email']::text[],
      $legal$PURCHASER SPOUSE CONSENT

The Purchaser spouse recorded below consents to this agreement and will sign where required.

Spouse: {{buyer_spouse_full_name}}
ID Number: {{buyer_spouse_id_number}}
Email: {{buyer_spouse_email}}$legal$),
    (array['mandate','otp']::text[], 'property_full_title_pack', 'Full Title Property Pack', 40,
      'property_title_type', 'equals', jsonb_build_array('full_title'),
      array['property_title_type','erf_number','erf_size','floor_size','property_estate_name']::text[],
      $legal$FULL TITLE PROPERTY DETAILS

Erf Number: {{erf_number}}
Erf Size: {{erf_size}}
Floor Size: {{floor_size}}
Estate / HOA: {{property_estate_name}}$legal$),
    (array['mandate','otp']::text[], 'property_sectional_title_pack', 'Sectional Title Property Pack', 41,
      'property_title_type', 'equals', jsonb_build_array('sectional_title'),
      array['property_title_type','property_unit_number','property_section_number','sectional_title_number','property_complex_name','property_estate_name']::text[],
      $legal$SECTIONAL TITLE PROPERTY DETAILS

Unit Number: {{property_unit_number}}
Section Number: {{property_section_number}}
Sectional Title Number: {{sectional_title_number}}
Scheme / Complex: {{property_complex_name}}
Estate: {{property_estate_name}}$legal$),
    (array['otp']::text[], 'bond_finance_pack', 'Bond Finance Pack', 50,
      'finance_type', 'in', jsonb_build_array('bond','combination'),
      array['finance_type','bond_amount']::text[],
      $legal$BOND FINANCE

This agreement is subject to the applicable bond terms and approval periods recorded in the transaction.

Finance Type: {{finance_type}}
Bond Amount: {{bond_amount}}$legal$),
    (array['otp']::text[], 'cash_sale_pack', 'Cash Sale Payment Pack', 51,
      'finance_type', 'equals', jsonb_build_array('cash'),
      array['finance_type','cash_amount']::text[],
      $legal$CASH SALE PAYMENT REQUIREMENTS

The Purchaser must provide proof of funds or acceptable cash payment undertakings within the required period.

Cash Amount: {{cash_amount}}$legal$),
    (array['otp']::text[], 'cash_contribution_pack', 'Combination Finance Cash Contribution Pack', 52,
      'finance_type', 'equals', jsonb_build_array('combination'),
      array['finance_type','cash_amount','bond_amount']::text[],
      $legal$CASH CONTRIBUTION

In addition to the bond finance, the Purchaser must provide proof of the cash contribution or an acceptable payment undertaking within the required period.

Cash Contribution: {{cash_amount}}
Bond Amount: {{bond_amount}}$legal$)
  ) as rows(packet_types, section_key, section_label, sort_order, condition_field, condition_operator, condition_values, placeholder_keys, legal_text)
)
insert into public.document_template_sections (
  template_id, section_key, section_label, section_type, sort_order,
  is_required, is_repeatable, condition_json, placeholder_keys, legal_text, metadata_json
)
select
  master.id,
  pack.section_key,
  pack.section_label,
  'legal_text',
  pack.sort_order,
  false,
  false,
  jsonb_build_object(
    'enabled', true,
    'rule', jsonb_build_object(
      'field', pack.condition_field,
      'operator', pack.condition_operator,
      'value', case when pack.condition_operator = 'in' then pack.condition_values else pack.condition_values -> 0 end
    ),
    'label', 'Platform-controlled conditional master rule'
  ),
  pack.placeholder_keys,
  pack.legal_text,
  jsonb_build_object(
    'editable', true,
    'conditional_pack', true,
    'condition_rule_locked', true,
    'conditional_master_version', 'conditional-master-v1',
    'starter_content_version', 'conditional-master-v1'
  )
from masters master
join pack_seed pack on master.packet_type = any(pack.packet_types)
on conflict (template_id, section_key)
do update set
  section_label = excluded.section_label,
  section_type = excluded.section_type,
  sort_order = excluded.sort_order,
  is_required = false,
  is_repeatable = false,
  condition_json = excluded.condition_json,
  placeholder_keys = excluded.placeholder_keys,
  -- Never replace approved wording when converting an existing global template.
  -- The seed copy is only a fallback for a new or currently blank pack.
  legal_text = coalesce(nullif(btrim(public.document_template_sections.legal_text), ''), excluded.legal_text),
  metadata_json = coalesce(public.document_template_sections.metadata_json, '{}'::jsonb) || excluded.metadata_json,
  updated_at = now();

-- Move unconditional sections into stable bands around the conditional packs.
update public.document_template_sections section
set sort_order = case section.section_key
  when 'introduction_purpose' then 0 when 'cover_page' then 0
  when 'parties' then 5 when 'schedule_1' then 5
  when 'property_details' then 35
  when 'mandate_terms' then 60 when 'commission_terms' then 61 when 'marketing_listing_terms' then 62
  when 'definitions' then 60 when 'interpretation' then 61 when 'sale_acceptance' then 62 when 'purchase_price' then 63
  when 'property_risk_transfer' then 64 when 'occupation' then 65 when 'suspensive_conditions' then 66
  when 'warranties_capacity' then 67 when 'commission_certificates' then 68 when 'rates_breach_cooling' then 69
  when 'notices_jurisdiction_marital' then 70 when 'costs_general_terms' then 71
  when 'special_conditions' then 80 when 'general_terms' then 81 when 'popia_fica' then 82
  when 'signature_pages' then 100
  else section.sort_order
end,
updated_at = now()
from public.document_packet_templates template
where section.template_id = template.id
  and template.organisation_id is null
  and template.template_key in ('mandate_default_v1', 'otp_default_v1')
  and template.version_tag = 'v2';

update public.document_packet_templates template
set definition_json = public.bridge_build_template_definition_b1(template.id),
    updated_at = now()
where template.organisation_id is null
  and template.template_key in ('mandate_default_v1', 'otp_default_v1')
  and template.version_tag = 'v2';

update public.document_packet_templates source
set status = 'archived',
    is_active = false,
    is_default = false,
    superseded_by_template_id = revision.target_template_id,
    archived_at = now(),
    updated_at = now()
from phase4_conditional_master_revisions revision
where source.id = revision.source_template_id;

update public.document_packet_templates target
set status = 'published',
    is_active = true,
    is_default = true,
    published_at = now(),
    updated_at = now()
from phase4_conditional_master_revisions revision
where target.id = revision.target_template_id;

do $$
declare
  v_master_count integer;
  v_invalid_count integer;
begin
  select count(*) into v_master_count
  from public.document_packet_templates
  where organisation_id is null
    and template_key in ('mandate_default_v1', 'otp_default_v1')
    and version_tag = 'v2'
    and status = 'published'
    and is_active = true
    and is_default = true
    and metadata_json ->> 'conditional_master_version' = 'conditional-master-v1';

  if v_master_count <> 2 then
    raise exception 'Phase 4 requires exactly two global conditional masters; found %', v_master_count;
  end if;

  select count(*) into v_invalid_count
  from public.document_packet_templates template
  where template.organisation_id is null
    and template.template_key in ('mandate_default_v1', 'otp_default_v1')
    and template.version_tag = 'v2'
    and (
      template.template_format <> 'structured'
      or template.metadata_json ->> 'scenario_resolver_version' <> 'canonical_legal_document_scenario_v1'
      or template.metadata_json ->> 'core_condition_rules_locked' <> 'true'
      or (select count(*) from public.document_template_sections section
          where section.template_id = template.id
            and section.metadata_json ->> 'conditional_master_version' = 'conditional-master-v1') <
         case template.packet_type when 'mandate' then 6 else 13 end
      or exists (
        select 1 from public.document_template_sections section
        where section.template_id = template.id
          and section.metadata_json ->> 'conditional_master_version' = 'conditional-master-v1'
          and (
            section.metadata_json ->> 'condition_rule_locked' <> 'true'
            or coalesce(section.condition_json, '{}'::jsonb) = '{}'::jsonb
            or nullif(btrim(section.legal_text), '') is null
          )
      )
      or (select count(*) from public.document_template_sections section
          where section.template_id = template.id and section.section_key = 'signature_pages') <> 1
    );

  if v_invalid_count > 0 then
    raise exception 'Phase 4 conditional master validation failed for % template(s)', v_invalid_count;
  end if;
end $$;

commit;
