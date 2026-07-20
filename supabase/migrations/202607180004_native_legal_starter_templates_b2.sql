begin;

-- B2 promotes the global legal starters to database-native structured content.
-- Existing wording seeded in 202607120001 remains intact; no DOCX object is
-- required by any of these three starter definitions.
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
    null, 'agency', 'mandate', 'mandate_default_v1', 'Seller Mandate · Arch9 Starter',
    'structured', 'v1',
    'Native editable seller mandate with usable clauses, merge fields and signer roles.',
    'published', true, true,
    jsonb_build_object(
      'template_scope', 'global_default',
      'starter_template', 'arch9_native_b2',
      'starter_content_version', 'b2-v1',
      'render_mode', 'native_structured',
      'native_template', true,
      'inherit_organisation_branding', true,
      'default_signer_roles', jsonb_build_array(
        jsonb_build_object('role', 'seller', 'label', 'Seller', 'required', true, 'order', 0),
        jsonb_build_object('role', 'agent', 'label', 'Estate Agent', 'required', true, 'order', 1),
        jsonb_build_object('role', 'seller_spouse', 'label', 'Seller spouse / co-signer', 'required', false, 'order', 2),
        jsonb_build_object('role', 'witness', 'label', 'Witness', 'required', false, 'order', 3)
      ),
      'branding', jsonb_build_object('inheritOrganisationBranding', true)
    ),
    now()
  ),
  (
    null, 'agency', 'otp', 'otp_default_v1', 'Offer to Purchase · Arch9 Starter',
    'structured', 'v1',
    'Native editable Offer to Purchase with transaction clauses, conditions and signer roles.',
    'published', true, true,
    jsonb_build_object(
      'template_scope', 'global_default',
      'starter_template', 'arch9_native_b2',
      'starter_content_version', 'b2-v1',
      'render_mode', 'native_structured',
      'native_template', true,
      'inherit_organisation_branding', true,
      'default_signer_roles', jsonb_build_array(
        jsonb_build_object('role', 'purchaser_1', 'label', 'Purchaser', 'required', true, 'order', 0),
        jsonb_build_object('role', 'seller', 'label', 'Seller', 'required', true, 'order', 1),
        jsonb_build_object('role', 'agent', 'label', 'Estate Agent', 'required', false, 'order', 2),
        jsonb_build_object('role', 'purchaser_spouse', 'label', 'Purchaser spouse / co-signer', 'required', false, 'order', 3),
        jsonb_build_object('role', 'witness', 'label', 'Witness', 'required', false, 'order', 4)
      ),
      'branding', jsonb_build_object('inheritOrganisationBranding', true)
    ),
    now()
  ),
  (
    null, 'agency', 'addendum', 'addendum_default_v1', 'General Addendum · Arch9 Starter',
    'structured', 'v1',
    'Native editable addendum linked to a mandate or Offer to Purchase.',
    'published', true, true,
    jsonb_build_object(
      'template_scope', 'global_default',
      'starter_template', 'arch9_native_b2',
      'starter_content_version', 'b2-v1',
      'render_mode', 'native_structured',
      'native_template', true,
      'inherit_organisation_branding', true,
      'default_signer_roles', jsonb_build_array(
        jsonb_build_object('role', 'purchaser_1', 'label', 'Purchaser', 'required', false, 'order', 0),
        jsonb_build_object('role', 'seller', 'label', 'Seller', 'required', true, 'order', 1),
        jsonb_build_object('role', 'agent', 'label', 'Estate Agent', 'required', false, 'order', 2)
      ),
      'branding', jsonb_build_object('inheritOrganisationBranding', true)
    ),
    now()
  )
on conflict (template_key, version_tag) where organisation_id is null
do update set
  module_type = excluded.module_type,
  packet_type = excluded.packet_type,
  template_label = excluded.template_label,
  template_format = 'structured',
  template_storage_bucket = null,
  template_storage_path = null,
  template_file_name = null,
  description = excluded.description,
  status = 'published',
  is_default = true,
  is_active = true,
  metadata_json = (
    coalesce(public.document_packet_templates.metadata_json, '{}'::jsonb)
      - 'template_storage_bucket' - 'template_bucket' - 'templateBucket'
      - 'template_storage_path' - 'templatePath'
      - 'template_file_name' - 'template_filename' - 'templateFilename'
  ) || excluded.metadata_json,
  published_at = coalesce(public.document_packet_templates.published_at, excluded.published_at, now()),
  updated_at = now();

-- Some early production seed runs contain the older 8-section mandate and
-- 7-section OTP shapes even though the migration ledger records the canonical
-- starter seed. Add the minimum canonical keys required by the native contract
-- without deleting any usable historical wording.
with starter_templates as (
  select id, template_key
  from public.document_packet_templates
  where organisation_id is null
    and version_tag = 'v1'
    and template_key in ('mandate_default_v1', 'otp_default_v1')
), required_sections as (
  select * from (values
    ('mandate_default_v1', 'general_terms', 'General Legal Terms', 'legal_text', 7, true,
      array['document_reference']::text[],
      $legal$GENERAL TERMS

This mandate is governed by South African law. The parties choose their recorded addresses as domicilium for notices unless changed in writing.

No amendment, cancellation or waiver is valid unless recorded in writing and accepted by the parties. If any provision is unenforceable, the remaining provisions continue to apply.$legal$),
    ('mandate_default_v1', 'popia_fica', 'POPIA and FICA', 'legal_text', 8, true,
      array['seller_full_name']::text[],
      $legal$POPIA AND FICA

The Seller consents to the processing of personal information reasonably required for marketing, mandate administration, FICA verification, transaction communication, record keeping and related property services.$legal$),
    ('otp_default_v1', 'cover_page', 'Cover Page', 'legal_text', 0, true,
      array['property_address', 'agent_full_name', 'organisation_name', 'document_reference', 'transaction_reference']::text[],
      $legal$OFFER TO PURCHASE

Property Address: {{property_address}}
Agent: {{agent_full_name}}
Agency: {{organisation_name}}
Document Reference: {{document_reference}}
Transaction Reference: {{transaction_reference}}

This Offer to Purchase becomes a deed of sale when accepted by the Seller in writing. The schedules, standard terms, special conditions and annexures form one agreement.$legal$),
    ('otp_default_v1', 'parties', 'Parties', 'dynamic_fields', 1, true,
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
Telephone: {{seller_phone}}$legal$),
    ('otp_default_v1', 'purchase_price', 'Purchase Price', 'dynamic_fields', 3, true,
      array['purchase_price', 'deposit_amount', 'finance_type', 'bond_amount', 'cash_amount']::text[],
      $legal$PURCHASE PRICE

Purchase Price: {{purchase_price}}
Deposit: {{deposit_amount}}
Finance Type: {{finance_type}}
Bond Amount: {{bond_amount}}
Cash Contribution: {{cash_amount}}

The Purchase Price is payable in accordance with the accepted offer, guarantees, bond approval, cash undertakings and conveyancer requirements.$legal$),
    ('otp_default_v1', 'suspensive_conditions', 'Suspensive Conditions', 'dynamic_fields', 5, false,
      array['suspensive_conditions', 'finance_type', 'bond_amount']::text[],
      $legal$SUSPENSIVE CONDITIONS

Finance Type: {{finance_type}}
Bond Amount: {{bond_amount}}

{{suspensive_conditions}}

If a suspensive condition is not fulfilled or waived within the agreed period, the parties must follow the consequence recorded in the agreement.$legal$),
    ('otp_default_v1', 'general_terms', 'General Legal Terms', 'legal_text', 10, true,
      array['document_reference']::text[],
      $legal$GENERAL TERMS

The parties choose their recorded addresses for notices and consent to the jurisdiction recorded in the final agreement. No amendment or cancellation is valid unless reduced to writing and signed or accepted by the parties as required.

The parties consent to processing of personal information required for conveyancing, finance, verification, communication and transaction administration.$legal$)
  ) as rows(template_key, section_key, section_label, section_type, sort_order, is_required, placeholder_keys, legal_text)
)
insert into public.document_template_sections (
  template_id, section_key, section_label, section_type, sort_order,
  is_required, is_repeatable, condition_json, placeholder_keys, legal_text, metadata_json
)
select
  template.id, section.section_key, section.section_label, section.section_type,
  section.sort_order, section.is_required, false, '{}'::jsonb,
  section.placeholder_keys, section.legal_text,
  jsonb_build_object('editable', true, 'starter_content_version', 'b2-v1')
from starter_templates template
join required_sections section using (template_key)
on conflict (template_id, section_key)
do update set
  section_label = excluded.section_label,
  section_type = excluded.section_type,
  sort_order = excluded.sort_order,
  is_required = excluded.is_required,
  placeholder_keys = excluded.placeholder_keys,
  legal_text = excluded.legal_text,
  metadata_json = coalesce(public.document_template_sections.metadata_json, '{}'::jsonb) || excluded.metadata_json,
  updated_at = now();

update public.document_template_sections section
set sort_order = case template.packet_type when 'mandate' then 9 else 11 end,
    updated_at = now()
from public.document_packet_templates template
where section.template_id = template.id
  and template.organisation_id is null
  and template.template_key in ('mandate_default_v1', 'otp_default_v1')
  and section.section_key = 'signature_pages';

with addendum_template as (
  select id
  from public.document_packet_templates
  where organisation_id is null
    and template_key = 'addendum_default_v1'
    and version_tag = 'v1'
), addendum_sections as (
  select * from (values
    (
      'cover_page', 'General Addendum', 'legal_text', 0, true,
      '{}'::jsonb,
      array['property_address', 'document_reference', 'transaction_reference', 'generated_date']::text[],
      $legal$GENERAL ADDENDUM

This Addendum supplements the agreement identified below and must be read together with that agreement.

Property: {{property_address}}
Document Reference: {{document_reference}}
Transaction Reference: {{transaction_reference}}
Date: {{generated_date}}$legal$
    ),
    (
      'parties', 'Parties', 'dynamic_fields', 1, true,
      '{}'::jsonb,
      array['buyer_full_name', 'seller_full_name', 'organisation_name', 'agent_full_name']::text[],
      $legal$PARTIES

Purchaser: {{buyer_full_name}}
Seller: {{seller_full_name}}
Agency: {{organisation_name}}
Agent: {{agent_full_name}}

Each signatory warrants that they have capacity and authority to agree to this Addendum.$legal$
    ),
    (
      'linked_document', 'Linked Agreement', 'dynamic_fields', 2, true,
      '{}'::jsonb,
      array['linked_document_title', 'linked_document_date', 'document_reference']::text[],
      $legal$LINKED AGREEMENT

This Addendum relates to {{linked_document_title}}, dated {{linked_document_date}}, with reference {{document_reference}}.

Unless expressly amended below, every provision of the linked agreement remains unchanged and enforceable.$legal$
    ),
    (
      'agreed_changes', 'Agreed Changes', 'legal_text', 3, true,
      '{}'::jsonb,
      array['addendum_terms', 'effective_date']::text[],
      $legal$AGREED CHANGES

The parties agree that the linked agreement is amended or supplemented as follows:

{{addendum_terms}}

These changes take effect on {{effective_date}}. If this Addendum conflicts with the linked agreement, this Addendum prevails only to the extent of the conflict.$legal$
    ),
    (
      'unchanged_terms', 'Terms Remaining in Force', 'legal_text', 4, true,
      '{}'::jsonb,
      array[]::text[],
      $legal$TERMS REMAINING IN FORCE

Except for the changes expressly recorded in this Addendum, the linked agreement is confirmed and remains in full force. This Addendum and the linked agreement constitute one agreement.$legal$
    ),
    (
      'signature_pages', 'Signatures', 'signature_zone', 5, true,
      '{}'::jsonb,
      array['buyer_full_name', 'seller_full_name', 'agent_full_name', 'signed_date']::text[],
      $legal$SIGNATURES

Purchaser: {{buyer_full_name}}
Signature: ______________________________
Date: {{signed_date}}

Seller: {{seller_full_name}}
Signature: ______________________________
Date: {{signed_date}}

Agent: {{agent_full_name}}
Signature: ______________________________
Date: {{signed_date}}$legal$
    )
  ) as rows(section_key, section_label, section_type, sort_order, is_required, condition_json, placeholder_keys, legal_text)
)
insert into public.document_template_sections (
  template_id, section_key, section_label, section_type, sort_order,
  is_required, is_repeatable, condition_json, placeholder_keys, legal_text, metadata_json
)
select
  template.id,
  section.section_key,
  section.section_label,
  section.section_type,
  section.sort_order,
  section.is_required,
  false,
  section.condition_json,
  section.placeholder_keys,
  section.legal_text,
  jsonb_build_object(
    'editable', true,
    'editable_by', array['principal', 'super_admin', 'admin', 'agent', 'attorney'],
    'starter_content_version', 'b2-v1'
  )
from addendum_template template
cross join addendum_sections section
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
  metadata_json = coalesce(public.document_template_sections.metadata_json, '{}'::jsonb) || excluded.metadata_json,
  updated_at = now();

-- Record one genuine conditional section in each transaction-oriented starter.
update public.document_template_sections section
set
  condition_json = jsonb_build_object(
    'enabled', true,
    'rule', jsonb_build_object('field', 'finance_type', 'operator', 'not_in', 'value', jsonb_build_array('cash')),
    'label', 'Show when the purchase is not a cash-only transaction'
  ),
  updated_at = now()
from public.document_packet_templates template
where section.template_id = template.id
  and template.organisation_id is null
  and template.template_key = 'otp_default_v1'
  and section.section_key = 'suspensive_conditions';

-- Signature zones are visible document content. These role declarations are
-- defaults only; interactive PDF coordinates are deliberately placed later.
update public.document_template_sections section
set
  metadata_json = coalesce(section.metadata_json, '{}'::jsonb) || jsonb_build_object(
    'editable', true,
    'visible_signing_block', true,
    'signer_roles', case template.packet_type
      when 'mandate' then jsonb_build_array('seller', 'agent', 'seller_spouse', 'witness')
      when 'otp' then jsonb_build_array('purchaser_1', 'seller', 'agent', 'purchaser_spouse', 'witness')
      else jsonb_build_array('purchaser_1', 'seller', 'agent')
    end,
    'starter_content_version', 'b2-v1'
  ),
  updated_at = now()
from public.document_packet_templates template
where section.template_id = template.id
  and template.organisation_id is null
  and template.template_key in ('mandate_default_v1', 'otp_default_v1', 'addendum_default_v1')
  and section.section_type = 'signature_zone';

-- Fail the migration instead of publishing an empty or scaffold-only starter.
do $$
declare
  v_invalid_count integer;
begin
  select count(*) into v_invalid_count
  from public.document_packet_templates template
  where template.organisation_id is null
    and template.template_key in ('mandate_default_v1', 'otp_default_v1', 'addendum_default_v1')
    and (
      template.template_format <> 'structured'
      or template.template_storage_path is not null
      or template.template_storage_bucket is not null
      or template.status <> 'published'
      or not template.is_active
      or (select count(*) from public.document_template_sections section where section.template_id = template.id) <
        case template.packet_type when 'mandate' then 10 when 'otp' then 12 else 5 end
      or exists (
        select 1
        from public.document_template_sections section
        where section.template_id = template.id
          and (
            nullif(btrim(section.legal_text), '') is null
            or section.legal_text ~* '(update this clause|lorem ipsum|todo|tbd|insert (clause|text)|placeholder copy)'
          )
      )
    );

  if v_invalid_count > 0 then
    raise exception 'B2 native starter validation failed for % template(s).', v_invalid_count;
  end if;
end;
$$;

commit;
