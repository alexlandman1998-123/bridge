import assert from 'node:assert/strict'
import test from 'node:test'
import { listPublishableLegalClausePackKeys } from '../legalClausePackCoverage.js'
import { buildOtpAttorneyReadiness } from '../otpAttorneyReadiness.js'
import { auditOtpPhase3CandidateSections, buildOtpPhase3CandidateSections } from '../otpPhase3Template.js'

const base = [
  { sectionKey: 'cover_page', sectionLabel: 'Cover', legalText: 'Offer to purchase' },
  { sectionKey: 'schedule_1', sectionLabel: 'Schedule', sectionType: 'dynamic_fields', legalText: '{{purchase_price}}' },
  { sectionKey: 'buyer_individual_capacity_pack', sectionLabel: 'Individual buyer', legalText: 'Individual buyer wording', conditionJson: { enabled: true, field: 'buyer_entity_type', operator: 'equals', value: 'individual' } },
  { sectionKey: 'buyer_company_authority_pack', sectionLabel: 'Company buyer', legalText: 'Authority wording', conditionJson: { enabled: true, field: 'buyer_entity_type', operator: 'equals', value: 'company' } },
  { sectionKey: 'buyer_trust_authority_pack', sectionLabel: 'Trust buyer', legalText: 'Trust buyer wording', conditionJson: { enabled: true, field: 'buyer_entity_type', operator: 'equals', value: 'trust' } },
  { sectionKey: 'buyer_spouse_consent_pack', sectionLabel: 'Buyer spouse', legalText: 'Buyer spouse wording', conditionJson: { enabled: true, field: 'buyer_spouse_consent_required', operator: 'equals', value: 'Yes' } },
  { sectionKey: 'seller_individual_capacity_pack', sectionLabel: 'Individual seller', legalText: 'Individual seller wording', conditionJson: { enabled: true, field: 'seller_entity_type', operator: 'equals', value: 'individual' } },
  { sectionKey: 'seller_company_authority_pack', sectionLabel: 'Company seller', legalText: 'Company seller wording', conditionJson: { enabled: true, field: 'seller_entity_type', operator: 'equals', value: 'company' } },
  { sectionKey: 'seller_trust_authority_pack', sectionLabel: 'Trust seller', legalText: 'Trust seller wording', conditionJson: { enabled: true, field: 'seller_entity_type', operator: 'equals', value: 'trust' } },
  { sectionKey: 'seller_spouse_consent_pack', sectionLabel: 'Seller spouse', legalText: 'Seller spouse wording', conditionJson: { enabled: true, field: 'seller_spouse_consent_required', operator: 'equals', value: 'Yes' } },
  { sectionKey: 'schedule_2', sectionLabel: 'Bond finance', sectionType: 'dynamic_fields', legalText: '{{bond_amount}}', conditionJson: { enabled: true, field: 'finance_type', operator: 'equals', value: 'bond' } },
  { sectionKey: 'cash_sale_pack', sectionLabel: 'Cash sale', legalText: 'Cash wording', conditionJson: { enabled: true, field: 'finance_type', operator: 'equals', value: 'cash' } },
  { sectionKey: 'definitions', sectionLabel: 'Definitions', legalText: 'Definitions wording' },
  { sectionKey: 'signature_pages', sectionLabel: 'Signatures', sectionType: 'signature_zone', legalText: 'Sign here' },
]

test('adds every missing Phase 3 clause pack without duplicating existing packs', () => {
  const sections = buildOtpPhase3CandidateSections(base)
  const audit = auditOtpPhase3CandidateSections(sections)
  assert.equal(audit.complete, true)
  assert.equal(audit.coveredPackCount, listPublishableLegalClausePackKeys().length)
  assert.equal(sections.filter((section) => section.sectionKey === 'bond_finance_pack').length, 0)
  assert.equal(sections.filter((section) => section.sectionKey === 'schedule_2').length, 1)
})

test('audit exposes an incomplete Phase 2 base instead of claiming full coverage', () => {
  const audit = auditOtpPhase3CandidateSections(buildOtpPhase3CandidateSections(base.filter((section) => section.sectionKey !== 'buyer_trust_authority_pack')))
  assert.equal(audit.complete, false)
  assert.deepEqual(audit.missingPackKeys, ['buyer_trust_authority_pack'])
})

test('places exception clauses before the standard legal core', () => {
  const sections = buildOtpPhase3CandidateSections(base)
  assert.ok(sections.findIndex((section) => section.sectionKey === 'vat_zero_rated_tax_pack') < sections.findIndex((section) => section.sectionKey === 'definitions'))
  assert.deepEqual(sections.map((section) => section.sortOrder), sections.map((_, index) => index))
})

test('marks all legal wording for attorney review and keeps publication blocked', () => {
  const sections = buildOtpPhase3CandidateSections(base)
  const readiness = buildOtpAttorneyReadiness({ template: { id: 'phase3-draft', status: 'draft', governance_version: 1 }, sections })
  assert.equal(readiness.canSubmitForAttorneyReview, true)
  assert.equal(readiness.canPublish, false)
  assert.equal(readiness.clauseCoverage.missingWording.length, 0)
  assert.equal(readiness.summary.approvedReviewItems, 0)
  assert.ok(readiness.summary.pendingReviewItems >= listPublishableLegalClausePackKeys().length)
})
