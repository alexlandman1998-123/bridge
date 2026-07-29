import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  OTP_BASELINE_CONCEPT_REQUIREMENTS,
  OTP_TEMPLATE_BASELINE_CONCEPT_AUDIT_VERSION,
  buildOtpTemplateBaselineConceptAudit,
  formatOtpTemplateBaselineConceptAuditMarkdown,
  normalizeOtpBaselineSection,
} from '../src/core/documents/otpTemplateBaselineConceptAudit.js'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
assert.equal(
  packageJson.scripts?.['test:otp-template-baseline-concept-audit-phase1'],
  'node scripts/otp-template-baseline-concept-audit-phase1.test.mjs',
  'package.json should expose the OTP template baseline concept audit Phase 1 contract.',
)
assert.equal(
  packageJson.scripts?.['audit:otp-template-baseline-concept'],
  'node --env-file=.env --env-file=.env.staging.local scripts/audit-otp-template-baseline-concept.mjs',
  'package.json should expose the read-only OTP baseline concept audit reporter.',
)
assert.ok(
  packageJson.scripts?.['verify:otp-template-vnext']?.includes('test:otp-template-baseline-concept-audit-phase1'),
  'package.json should include OTP Phase 1 in the OTP vNext verifier.',
)

function condition(field, value) {
  return {
    enabled: true,
    rule: { field, operator: 'equals', value },
  }
}

const template = {
  id: 'otp-template-id',
  organisation_id: null,
  module_type: 'agency',
  packet_type: 'otp',
  template_key: 'otp_default_v1',
  template_label: 'Offer to Purchase · Baseline Fixture',
  template_format: 'structured',
  status: 'published',
  is_active: true,
  is_default: true,
  version_tag: 'canonical-otp-v1',
  metadata_json: { render_mode: 'native_structured' },
}

const sections = [
  {
    template_id: template.id,
    section_key: 'buyer_details',
    section_label: 'Buyer Details',
    section_type: 'dynamic_fields',
    sort_order: 0,
    is_required: true,
    placeholder_keys: ['buyer_full_name', 'buyer_id_number', 'buyer_email'],
    legal_text: `BUYER DETAILS

Buyer: {{buyer_full_name}}
ID / Registration: {{buyer_id_number}}
Email: {{buyer_email}}`,
  },
  {
    template_id: template.id,
    section_key: 'seller_details',
    section_label: 'Seller Details',
    section_type: 'dynamic_fields',
    sort_order: 5,
    is_required: true,
    placeholder_keys: ['seller_full_name', 'seller_id_number'],
    legal_text: `SELLER DETAILS

Seller: {{seller_full_name}}
ID / Registration: {{seller_id_number}}`,
  },
  {
    template_id: template.id,
    section_key: 'property_details',
    section_label: 'Property Packet',
    section_type: 'dynamic_fields',
    sort_order: 10,
    is_required: true,
    placeholder_keys: ['property_address', 'property_unit_number', 'erf_number'],
    legal_text: `PROPERTY

Property Address: {{property_address}}
Unit: {{property_unit_number}}
Erf: {{erf_number}}`,
  },
  {
    template_id: template.id,
    section_key: 'purchase_terms',
    section_label: 'Purchase Terms',
    section_type: 'dynamic_fields',
    sort_order: 20,
    is_required: true,
    placeholder_keys: ['purchase_price', 'deposit_amount', 'finance_type'],
    legal_text: `PURCHASE TERMS

Purchase Price: {{purchase_price}}
Deposit: {{deposit_amount}}
Finance Type: {{finance_type}}

The purchase price is payable against transfer and guarantees where required.`,
  },
  {
    template_id: template.id,
    section_key: 'finance_clause_bond',
    section_label: 'Finance Clause (Bond)',
    section_type: 'legal_text',
    sort_order: 30,
    is_required: false,
    condition_json: condition('finance_type', 'bond'),
    placeholder_keys: ['bond_amount', 'suspensive_conditions'],
    legal_text: `BOND FINANCE

Bond Amount: {{bond_amount}}
This offer is subject to bond approval and any recorded suspensive condition.
{{suspensive_conditions}}`,
  },
  {
    template_id: template.id,
    section_key: 'entity_clause_company',
    section_label: 'Company Authority Clause',
    section_type: 'legal_text',
    sort_order: 40,
    is_required: false,
    condition_json: condition('buyer_entity_type', 'company'),
    placeholder_keys: ['buyer_representative_name', 'buyer_representative_capacity', 'buyer_resolution_date'],
    legal_text: `COMPANY AUTHORITY

The buyer representative warrants authority by resolution.
Representative: {{buyer_representative_name}}
Capacity: {{buyer_representative_capacity}}
Resolution Date: {{buyer_resolution_date}}`,
  },
  {
    template_id: template.id,
    section_key: 'mandatory_disclosure',
    section_label: 'Mandatory Disclosure',
    section_type: 'dynamic_fields',
    sort_order: 50,
    is_required: true,
    placeholder_keys: ['mandatory_disclosure_status', 'mandatory_disclosure_annexure'],
    legal_text: `MANDATORY DISCLOSURE

Mandatory disclosure status: {{mandatory_disclosure_status}}
Disclosure annexure: {{mandatory_disclosure_annexure}}`,
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
    section_key: 'signature_pages',
    section_label: 'Signature Pages',
    section_type: 'signature_zone',
    sort_order: 100,
    is_required: true,
    placeholder_keys: ['buyer_full_name', 'seller_full_name'],
    legal_text: `SIGNATURES

Buyer: {{buyer_full_name}}
Seller: {{seller_full_name}}
Signed at date and capacity.`,
  },
]

const normalized = normalizeOtpBaselineSection(sections[2])
assert.equal(normalized.sectionKey, 'property_details')
assert.equal(normalized.renderedHeading, 'PROPERTY')
assert.ok(normalized.placeholderKeys.includes('property_address'))

const audit = buildOtpTemplateBaselineConceptAudit({ template, sections, checkedAt: '2026-07-29T12:00:00.000Z' })
assert.equal(audit.version, OTP_TEMPLATE_BASELINE_CONCEPT_AUDIT_VERSION)
assert.equal(audit.mutatedData, false)
assert.equal(audit.template.packetType, 'otp')
assert.equal(audit.status, 'OTP_VNEXT_CONCEPT_REMEDIATION_REQUIRED')
assert.equal(audit.visualBaseline.sectionCount, sections.length)
assert.equal(audit.visualBaseline.signatureSectionCount, 1)
assert.ok(audit.visualBaseline.layoutPreservationNotes.some((note) => note.includes('top-left logo')))
assert.ok(OTP_BASELINE_CONCEPT_REQUIREMENTS.length >= 10)
assert.equal(audit.conceptAudit.conceptCount, OTP_BASELINE_CONCEPT_REQUIREMENTS.length)
assert.ok(audit.conceptAudit.concepts.some((item) => item.key === 'purchase_economics' && item.status === 'covered'))
assert.ok(audit.conceptAudit.concepts.some((item) => item.key === 'finance_suspensive_conditions' && item.status === 'covered'))
assert.ok(audit.conceptAudit.concepts.some((item) => item.key === 'occupation_occupational_rent' && item.status !== 'covered'))
assert.ok(audit.conceptAudit.concepts.some((item) => item.key === 'transfer_conveyancer' && item.status !== 'covered'))
assert.ok(audit.conceptAudit.concepts.some((item) => item.key === 'fixtures_fittings_defects' && item.status === 'missing'))
assert.ok(audit.mergeFieldAudit.fields.some((field) => field.token === 'purchase_price' && field.status === 'canonical'))
assert.ok(audit.mergeFieldAudit.minimisationCandidates.some((item) => item.code === 'ROUTE_FLAGS_SHOULD_NOT_RENDER_AS_FACTS'))
assert.ok(audit.headingIssues.some((item) => item.code === 'CLIENT_FACING_PACKET_OR_PACK_HEADING'))
assert.ok(audit.headingIssues.some((item) => item.code === 'TECHNICAL_ROUTE_HEADING'))
assert.ok(audit.blankRenderRisks.some((item) => item.code === 'PLACEHOLDER_ONLY_LINE' && item.sectionKey === 'special_conditions'))
assert.ok(audit.recommendedActions.some((item) => item.action.includes('Normalise OTP merge fields')))

const markdown = formatOtpTemplateBaselineConceptAuditMarkdown(audit)
for (const token of [
  'OTP Template vNext Phase 1 Baseline + Concept Audit',
  'Concept Coverage',
  'Merge-Field Minimisation',
  'CLIENT_FACING_PACKET_OR_PACK_HEADING',
  'Fixtures, fittings and defects',
]) {
  assert.ok(markdown.includes(token), `markdown should include ${token}`)
}

const source = await readFile(new URL('../src/core/documents/otpTemplateBaselineConceptAudit.js', import.meta.url), 'utf8')
for (const token of [
  'OTP_TEMPLATE_BASELINE_CONCEPT_AUDIT_VERSION',
  'buildOtpTemplateBaselineConceptAudit',
  'formatOtpTemplateBaselineConceptAuditMarkdown',
  'validateTemplateTokensAgainstRegistry',
  'OTP_BASELINE_CONCEPT_REQUIREMENTS',
]) {
  assert.ok(source.includes(token), `source should include ${token}`)
}

console.log('OTP template baseline concept audit Phase 1 contract passed.')
