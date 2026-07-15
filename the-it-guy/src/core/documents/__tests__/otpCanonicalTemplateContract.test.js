import assert from 'node:assert/strict'
import test from 'node:test'
import {
  OTP_CANONICAL_DOCUMENT_MODEL,
  OTP_CANONICAL_FIELD_INVENTORY,
  OTP_FIXED_LEGAL_CORE,
  OTP_ONBOARDING_GAPS,
  OTP_VARIABLE_LEGAL_TEXT_FIELDS,
  buildOtpCanonicalPhaseOneReport,
  validateOtpCanonicalTemplateContract,
} from '../otpCanonicalTemplateContract.js'

test('models the current OTP as one populated master document', () => {
  assert.equal(OTP_CANONICAL_DOCUMENT_MODEL.mode, 'single_master_document')
  assert.equal(OTP_CANONICAL_DOCUMENT_MODEL.assemblyRule, 'populate_existing_document')
  assert.equal(OTP_CANONICAL_DOCUMENT_MODEL.partyClassificationRule, 'populate_fields_never_select_template')
})

test('keeps clauses 3 through 30 in the fixed legal core', () => {
  assert.equal(OTP_FIXED_LEGAL_CORE.length, 28)
  assert.equal(OTP_FIXED_LEGAL_CORE[0].number, '3')
  assert.equal(OTP_FIXED_LEGAL_CORE.at(-1).number, '30')
  assert.equal(OTP_FIXED_LEGAL_CORE.find((entry) => entry.number === '12')?.key, 'suspensive_conditions')
  assert.equal(OTP_FIXED_LEGAL_CORE.find((entry) => entry.number === '14')?.key, 'capacity_of_parties')
})

test('exposes only the two exceptional legal-text regions', () => {
  assert.deepEqual(OTP_VARIABLE_LEGAL_TEXT_FIELDS, [
    'conditions.other_suspensive_conditions',
    'conditions.special_conditions',
  ])
  const variableFields = OTP_CANONICAL_FIELD_INVENTORY.filter((entry) => entry.legalText)
  assert.ok(variableFields.every((entry) => entry.coverage === 'approved_clause'))
})

test('treats entity and marital classifications as populated facts rather than template variants', () => {
  const purchaserName = OTP_CANONICAL_FIELD_INVENTORY.find((entry) => entry.key === 'purchaser_1.full_name')
  const maritalStatus = OTP_CANONICAL_FIELD_INVENTORY.find((entry) => entry.key === 'purchaser.marital_status')

  assert.deepEqual(purchaserName.sourcePaths, ['buyer.person.full_name', 'buyer.entity.legal_name'])
  assert.equal(maritalStatus.applicableWhen, 'purchaser_is_natural_person')
  assert.equal(OTP_CANONICAL_FIELD_INVENTORY.some((entry) => entry.section.includes('company_template')), false)
  assert.equal(OTP_CANONICAL_FIELD_INVENTORY.some((entry) => entry.section.includes('trust_template')), false)
})

test('records every field as mapped, derived, controlled, signed, exceptional, manual or a known gap', () => {
  const validation = validateOtpCanonicalTemplateContract()
  assert.deepEqual(validation, { valid: true, errors: [] })
  assert.ok(OTP_CANONICAL_FIELD_INVENTORY.length >= 80)
  assert.ok(OTP_ONBOARDING_GAPS.length > 0)
  assert.ok(OTP_ONBOARDING_GAPS.every((gap) => gap.recommendation))
})

test('produces a phase-one report that can drive the next implementation phases', () => {
  const report = buildOtpCanonicalPhaseOneReport()

  assert.equal(report.validation.valid, true)
  assert.equal(report.summary.fieldCount, OTP_CANONICAL_FIELD_INVENTORY.length)
  assert.equal(report.summary.fixedLegalClauseCount, 28)
  assert.equal(report.summary.variableLegalTextFieldCount, 2)
  assert.equal(report.summary.onboardingGapCount, OTP_ONBOARDING_GAPS.length)
  assert.equal(report.summary.coverage.gap, OTP_ONBOARDING_GAPS.length)
})
