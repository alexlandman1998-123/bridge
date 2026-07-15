import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildOtpLegalBaseline,
  createOtpAttorneyReviewManifest,
  extractOtpTemplateVariables,
  validateOtpAttorneyReview,
  validateOtpLegalBaseline,
} from '../otpLegalBaseline.js'

const template = {
  id: '5eb54da8-6e9a-4364-9dc9-083f72cd0791',
  packet_type: 'otp',
  template_key: 'kingstons_otp',
  template_label: 'Kingstons OTP',
  is_active: true,
  is_default: true,
}

const sections = [
  { section_key: 'standard_terms', section_label: 'Standard Terms', section_type: 'legal_text', sort_order: 2, legal_text: 'The parties choose {{property_address}}.' },
  { section_key: 'schedule_1', section_label: 'Schedule 1', section_type: 'dynamic_fields', sort_order: 1, placeholder_keys: ['buyer_full_name'], legal_text: '{{buyer_full_name}} offers {{purchase_price}}.' },
  { section_key: 'buyer_company_authority_pack', section_label: 'Company Authority', section_type: 'legal_text', sort_order: 3, condition_json: { enabled: true, field: 'buyer_entity_type', operator: 'equals', value: 'company' }, legal_text: '{{buyer_company_name}} is represented by {{buyer_representative_name}}.' },
  { section_key: 'signature_pages', section_label: 'Signature Pages', section_type: 'signature_zone', sort_order: 4, legal_text: 'Signed by {{buyer_full_name}}.' },
]

test('extracts and de-duplicates template variables', () => {
  assert.deepEqual(extractOtpTemplateVariables('{{ buyer_name }} / {{buyer_name}} / {{property.address}}'), ['buyer_name', 'property.address'])
})

test('builds a plain-language OTP baseline with all four section classes', () => {
  const baseline = buildOtpLegalBaseline({ template, sections, source: { exportedAt: '2026-07-15T00:00:00.000Z' } })
  baseline.baselineHash = 'test-hash'
  assert.deepEqual(baseline.sections.map(({ key, classification }) => [key, classification]), [
    ['schedule_1', 'transaction_data'],
    ['standard_terms', 'core_wording'],
    ['buyer_company_authority_pack', 'conditional_clause'],
    ['signature_pages', 'signing'],
  ])
  assert.deepEqual(baseline.summary.classifications, {
    core_wording: 1,
    conditional_clause: 1,
    transaction_data: 1,
    signing: 1,
  })
  assert.deepEqual(baseline.findings, [])
  assert.deepEqual(baseline.sections[0].variables, ['buyer_full_name', 'purchase_price'])
  assert.equal(baseline.sections[2].activationFact.field, 'buyer_entity_type')
  assert.equal(validateOtpLegalBaseline(baseline).valid, true)
})

test('surfaces an incomplete legacy OTP as review findings without corrupting the snapshot', () => {
  const baseline = buildOtpLegalBaseline({
    template: {
      ...template,
      status: 'published',
      metadata_json: {
        lifecycle_status: 'draft',
        render_mode: 'legacy_docx',
        last_render_validation: {
          missingRequired: ['buyer_entity_type'],
          deprecatedTokens: [{ token: 'unit_number', canonicalKey: 'property_unit_number' }],
        },
      },
    },
    sections: sections.filter((section) => section.section_key !== 'standard_terms' && section.section_key !== 'buyer_company_authority_pack'),
  })
  const codes = baseline.findings.map((finding) => finding.code)
  assert.equal(codes.includes('NO_CORE_WORDING'), true)
  assert.equal(codes.includes('NO_CONDITIONAL_CLAUSES'), true)
  assert.equal(codes.includes('LIFECYCLE_STATUS_CONFLICT'), true)
  assert.equal(codes.includes('LEGACY_DOCX_PATH_MISSING'), true)
  assert.equal(codes.includes('REQUIRED_VARIABLES_MISSING'), true)
  assert.equal(codes.includes('DEPRECATED_VARIABLES'), true)
  assert.equal(baseline.summary.blockingFindingCount, 4)
})

test('keeps attorney approval separate and bound to the exact baseline hash', () => {
  const baseline = buildOtpLegalBaseline({ template, sections })
  baseline.baselineHash = 'content-hash-a'
  const review = createOtpAttorneyReviewManifest(baseline)
  assert.equal(review.status, 'pending')
  assert.equal(review.sections.every((entry) => entry.decision === 'pending'), true)
  assert.equal(validateOtpAttorneyReview(review, baseline).valid, true)

  review.status = 'approved'
  review.reviewer = { name: 'Review Attorney', role: 'Attorney', organisation: 'Law Firm' }
  review.reviewedAt = '2026-07-15T09:00:00.000Z'
  assert.equal(validateOtpAttorneyReview(review, baseline).valid, false)
  review.sections.forEach((entry) => { entry.decision = 'approved' })
  assert.equal(validateOtpAttorneyReview(review, baseline).valid, true)

  baseline.baselineHash = 'content-hash-b'
  assert.equal(validateOtpAttorneyReview(review, baseline).valid, false)
})

test('rejects conditional clauses without an activation fact', () => {
  const baseline = buildOtpLegalBaseline({
    template,
    sections: [{ section_key: 'special_case', condition_json: { enabled: true }, legal_text: 'Special wording.' }],
  })
  baseline.baselineHash = 'test-hash'
  assert.match(validateOtpLegalBaseline(baseline).errors.join(' '), /activation fact/i)
})
