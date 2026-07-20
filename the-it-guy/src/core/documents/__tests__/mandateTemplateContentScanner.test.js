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
        legal_text: 'The Seller shall disclose restrictions, servitudes, disputes, rules, or other matters affecting the Property.',
        placeholder_keys: ['property_address', 'property_title_type'],
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
        section_key: 'property_details',
        section_label: 'Property Details',
        legal_text: 'Body corporate levy and conduct rules must be captured for this mandate.',
        placeholder_keys: ['body_corporate_name', 'levy_amount'],
      },
    ],
  })

  assert.equal(report.isValidForPublish, false)
  assert.ok(report.blockers.some((issue) => issue.signalGroupKey === 'sectional_title'))
})
