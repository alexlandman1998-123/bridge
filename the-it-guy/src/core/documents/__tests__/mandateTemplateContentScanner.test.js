import assert from 'node:assert/strict'
import test from 'node:test'

import {
  scanMandateTemplateContent,
} from '../mandateTemplateContentScanner.js'

test('allows default mandate universal seller details without route-wording blockers', () => {
  const report = scanMandateTemplateContent({
    packet_type: 'mandate',
    metadata_json: {
      mandate_template_variant: 'default',
    },
    sections: [
      {
        section_key: 'introduction_purpose',
        section_label: 'Introduction and Purpose',
        legal_text: 'The Seller appoints the Agency for the marketing of the Property under this estate agency mandate. Commission is payable as recorded.',
        placeholder_keys: ['seller_full_name', 'property_address', 'commission_structure', 'asking_price', 'agent_full_name', 'organisation_name'],
      },
      {
        section_key: 'parties',
        section_label: 'Parties',
        legal_text: 'Seller ID / Registration Number: {{seller_id_number}}\nMarital Status: {{seller_marital_status}}',
        placeholder_keys: ['seller_id_number', 'seller_marital_status'],
      },
      {
        section_key: 'property_details',
        section_label: 'Property Details',
        section_type: 'dynamic_fields',
        legal_text: 'Unit Number: {{property_unit_number}}\nSection Number: {{property_section_number}}\nSectional Title Number: {{sectional_title_number}}\nComplex / Scheme Name: {{property_complex_name}}\nThe Seller shall disclose restrictions, servitudes, disputes, body corporate issues, estate rules, or other matters affecting the Property.',
        placeholder_keys: ['property_address', 'property_title_type', 'property_unit_number', 'property_section_number', 'sectional_title_number', 'property_complex_name'],
      },
    ],
  })

  assert.equal(report.isValidForPublish, true, report.blockers.map((issue) => issue.message).join('\n'))
  assert.equal(report.blockingCount, 0)
  assert.ok(report.warningCount >= 1)
  assert.ok(report.warnings.some((issue) => issue.signalGroupKey === 'individual_capacity'))
})

test('still blocks hard route-specific wording outside default conditional packs', () => {
  const report = scanMandateTemplateContent({
    packet_type: 'mandate',
    metadata_json: {
      mandate_template_variant: 'default',
    },
    sections: [
      {
        section_key: 'introduction_purpose',
        section_label: 'Introduction and Purpose',
        legal_text: 'The Seller appoints the Agency for the marketing of the Property under this estate agency mandate. Commission is payable as recorded.',
        placeholder_keys: ['seller_full_name', 'property_address', 'commission_structure', 'asking_price', 'agent_full_name', 'organisation_name'],
      },
      {
        section_key: 'unconditional_scheme_clause',
        section_label: 'Scheme Clause',
        legal_text: 'Body corporate levy and conduct rules must be captured for this mandate.',
        placeholder_keys: ['body_corporate_name', 'levy_amount'],
      },
    ],
  })

  assert.equal(report.isValidForPublish, false)
  assert.ok(report.blockers.some((issue) => issue.signalGroupKey === 'sectional_title'))
})

test('recognises nested conditional-master visibility rules on default packs', () => {
  const report = scanMandateTemplateContent({
    packet_type: 'mandate',
    metadata_json: {
      mandate_template_variant: 'default',
      conditional_master: true,
      conditional_master_version: 'conditional-master-v1',
    },
    sections: [
      {
        section_key: 'introduction_purpose',
        section_label: 'Introduction and Purpose',
        legal_text: 'The Seller appoints the Agency for the marketing of the Property under this estate agency mandate. Commission is payable as recorded.',
        placeholder_keys: ['seller_full_name', 'property_address', 'commission_structure', 'asking_price', 'agent_full_name', 'organisation_name'],
      },
      {
        section_key: 'seller_individual_capacity_pack',
        section_label: 'Seller Individual Capacity Pack',
        condition_json: {
          enabled: true,
          rule: {
            field: 'seller_entity_type',
            operator: 'equals',
            value: 'individual',
          },
        },
        legal_text: 'SELLER INDIVIDUAL CAPACITY\nSeller Marital Status\n{{seller_marital_status}}\nSpouse Consent Required\n{{seller_spouse_consent_required}}',
        placeholder_keys: ['seller_entity_type', 'seller_marital_status', 'seller_spouse_consent_required'],
      },
      {
        section_key: 'property_sectional_title_pack',
        section_label: 'Sectional Title Property Pack',
        condition_json: {
          enabled: true,
          rule: {
            field: 'property_title_type',
            operator: 'equals',
            value: 'sectional_title',
          },
        },
        legal_text: 'SECTIONAL TITLE PROPERTY DETAILS\nUnit Number: {{property_unit_number}}\nSection Number: {{property_section_number}}\nBody corporate levy details are recorded for this scenario.',
        placeholder_keys: ['property_title_type', 'property_unit_number', 'property_section_number', 'body_corporate_name', 'levy_amount'],
      },
    ],
  })

  assert.equal(report.isValidForPublish, true, report.blockers.map((issue) => issue.message).join('\n'))
  assert.equal(report.blockingCount, 0)
})
