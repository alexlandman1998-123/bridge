import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  MANDATE_TEMPLATE_BASELINE_AUDIT_VERSION,
  buildMandateTemplateBaselineAudit,
  formatMandateTemplateBaselineAuditMarkdown,
  normalizeMandateBaselineSection,
} from '../src/core/documents/mandateTemplateBaselineAudit.js'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
assert.equal(
  packageJson.scripts?.['test:mandate-template-baseline-audit-phase1'],
  'node scripts/mandate-template-baseline-audit-phase1.test.mjs',
  'package.json should expose the mandate template baseline audit Phase 1 contract.',
)
assert.equal(
  packageJson.scripts?.['audit:mandate-template-baseline'],
  'node --env-file=.env --env-file=.env.staging.local scripts/audit-mandate-template-baseline.mjs',
  'package.json should expose the read-only mandate baseline audit reporter.',
)

function condition(field, value) {
  return {
    enabled: true,
    rule: { field, operator: 'equals', value },
  }
}

const template = {
  id: 'mandate-template-id',
  organisation_id: null,
  module_type: 'agency',
  packet_type: 'mandate',
  template_key: 'mandate_default_v1',
  template_label: 'Seller Mandate · Baseline Fixture',
  template_format: 'structured',
  status: 'published',
  is_active: true,
  is_default: true,
  version_tag: 'content-gate-v5',
  metadata_json: { render_mode: 'native_structured' },
}

const sections = [
  {
    template_id: template.id,
    section_key: 'introduction_purpose',
    section_label: 'Introduction and Purpose',
    section_type: 'legal_text',
    sort_order: 0,
    is_required: true,
    placeholder_keys: ['agency_legal_name', 'agent_full_name', 'agent_ffc_number'],
    legal_text: `MANDATE AGREEMENT

This mandate records the appointment of {{agency_legal_name}} and {{agent_full_name}} to market and negotiate the sale of the property described in this document.

The Seller confirms that the information supplied for this mandate is true and that the Seller has authority to grant the mandate.`,
  },
  {
    template_id: template.id,
    section_key: 'parties',
    section_label: 'Parties',
    section_type: 'dynamic_fields',
    sort_order: 5,
    is_required: true,
    placeholder_keys: ['seller_full_name', 'seller_id_number', 'seller_email', 'organisation_name', 'agent_email'],
    legal_text: `SELLER

Seller: {{seller_full_name}}
Identity / Registration Number: {{seller_id_number}}
Email: {{seller_email}}

AGENCY AND AGENT

Agency: {{organisation_name}}
Agent Email: {{agent_email}}`,
  },
  {
    template_id: template.id,
    section_key: 'seller_company_authority_pack',
    section_label: 'Seller Company Authority Pack',
    section_type: 'legal_text',
    sort_order: 20,
    is_required: false,
    condition_json: condition('seller_entity_type', 'company'),
    placeholder_keys: ['seller_company_registration_number', 'seller_representative_name', 'seller_resolution_date'],
    legal_text: `SELLER COMPANY AUTHORITY

Registration Number: {{seller_company_registration_number}}
Representative: {{seller_representative_name}}
Resolution Date: {{seller_resolution_date}}`,
  },
  {
    template_id: template.id,
    section_key: 'special_conditions',
    section_label: 'Special Conditions',
    section_type: 'dynamic_fields',
    sort_order: 80,
    is_required: false,
    placeholder_keys: ['special_conditions', 'annexures_list'],
    legal_text: `SPECIAL CONDITIONS

{{special_conditions}}

Annexures:
{{annexures_list}}`,
  },
  {
    template_id: template.id,
    section_key: 'commission_terms',
    section_label: 'Commission Terms',
    section_type: 'dynamic_fields',
    sort_order: 81,
    is_required: true,
    placeholder_keys: ['mandate_commission_percent', 'mandate_commission_amount', 'vat_handling'],
    legal_text: `COMMISSION

Commission Percentage: {{mandate_commission_percent}}
Commission Amount: {{mandate_commission_amount}}
VAT Treatment: {{vat_handling}}

Commission is earned and payable according to the agreed commission structure.`,
  },
  {
    template_id: template.id,
    section_key: 'popia_fica',
    section_label: 'POPIA and FICA',
    section_type: 'legal_text',
    sort_order: 82,
    is_required: true,
    legal_text: 'POPIA AND FICA\n\nThe Seller consents to processing of personal information for mandate administration and FICA verification.',
  },
  {
    template_id: template.id,
    section_key: 'signature_pages',
    section_label: 'Signature Pages',
    section_type: 'signature_zone',
    sort_order: 100,
    is_required: true,
    placeholder_keys: ['seller_full_name', 'seller_signature', 'signed_date', 'agent_ffc_number'],
    legal_text: `SIGNATURES

Seller: {{seller_full_name}}
Signature: {{seller_signature}}
Date: {{signed_date}}

FFC Number: {{agent_ffc_number}}`,
  },
]

const normalized = normalizeMandateBaselineSection(sections[2])
assert.equal(normalized.sectionKey, 'seller_company_authority_pack')
assert.equal(normalized.renderedHeading, 'SELLER COMPANY AUTHORITY')
assert.equal(normalized.hasCondition, true)
assert.ok(normalized.placeholderKeys.includes('seller_company_registration_number'))

const audit = buildMandateTemplateBaselineAudit({ template, sections, checkedAt: '2026-07-28T12:00:00.000Z' })
assert.equal(audit.version, MANDATE_TEMPLATE_BASELINE_AUDIT_VERSION)
assert.equal(audit.mutatedData, false)
assert.equal(audit.status, 'V_NEXT_REMEDIATION_REQUIRED')
assert.equal(audit.visualBaseline.sectionCount, sections.length)
assert.equal(audit.visualBaseline.signatureSectionCount, 1)
assert.ok(audit.mergeFieldAudit.fields.some((field) => field.token === 'agency_legal_name' && field.status === 'alias_or_noncanonical' && field.canonicalKey === 'organisation_legal_name'))
assert.ok(audit.mergeFieldAudit.fields.some((field) => field.token === 'organisation_name' && field.status === 'alias_or_noncanonical' && field.canonicalKey === 'organisation_trading_name'))
assert.ok(audit.mergeFieldAudit.namingDecisions.some((item) => item.code === 'AGENCY_ORGANISATION_NAME_SPLIT'))
assert.ok(audit.headingIssues.some((item) => item.code === 'CLIENT_FACING_PACK_HEADING'))
assert.ok(audit.blankRenderRisks.some((item) => item.code === 'PLACEHOLDER_ONLY_LINE' && item.sectionKey === 'special_conditions'))
assert.ok(audit.wordingGaps.some((item) => item.code === 'MANDATORY_DISCLOSURE_CLAUSE_MISSING'))
assert.ok(audit.wordingGaps.some((item) => item.code === 'FFC_VALIDITY_WORDING_MISSING'))
assert.ok(audit.wordingGaps.some((item) => item.code === 'COMMISSION_TRIGGER_AND_VAT_TOO_LIGHT'))
assert.ok(audit.recommendedActions.some((item) => item.action.includes('Mandatory Disclosure')))

const markdown = formatMandateTemplateBaselineAuditMarkdown(audit)
for (const token of [
  'Mandate Template vNext Phase 1 Baseline Audit',
  'AGENCY_ORGANISATION_NAME_SPLIT',
  'CLIENT_FACING_PACK_HEADING',
  'MANDATORY_DISCLOSURE_CLAUSE_MISSING',
  'PLACEHOLDER_ONLY_LINE',
]) {
  assert.ok(markdown.includes(token), `markdown should include ${token}`)
}

const source = await readFile(new URL('../src/core/documents/mandateTemplateBaselineAudit.js', import.meta.url), 'utf8')
for (const token of [
  'MANDATE_TEMPLATE_BASELINE_AUDIT_VERSION',
  'buildMandateTemplateBaselineAudit',
  'formatMandateTemplateBaselineAuditMarkdown',
  'validateTemplateTokensAgainstRegistry',
  'CLIENT_FACING_PACK_HEADING',
]) {
  assert.ok(source.includes(token), `source should include ${token}`)
}

console.log('Mandate template baseline audit Phase 1 contract passed.')
