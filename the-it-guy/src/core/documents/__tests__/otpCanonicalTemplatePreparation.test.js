import assert from 'node:assert/strict'
import test from 'node:test'
import {
  OTP_CANONICAL_FIELD_INVENTORY,
  OTP_VARIABLE_LEGAL_TEXT_FIELDS,
} from '../otpCanonicalTemplateContract.js'
import {
  OTP_CANONICAL_FORMATTING_RULES,
  buildOtpCanonicalTemplateManifest,
  validateOtpCanonicalTemplateManifest,
} from '../otpCanonicalTemplatePreparation.js'

test('accounts for every canonical OTP field in the generation-ready manifest', () => {
  const manifest = buildOtpCanonicalTemplateManifest()
  const validation = validateOtpCanonicalTemplateManifest(manifest)

  assert.deepEqual(validation.errors, [])
  assert.equal(validation.valid, true)
  assert.equal(manifest.fields.length, OTP_CANONICAL_FIELD_INVENTORY.length)
  assert.ok(validation.tokenCount >= 100)
})

test('keeps variable legal wording limited to the two approved schedule regions', () => {
  const manifest = buildOtpCanonicalTemplateManifest()
  const variable = manifest.fields.filter((field) => field.legalText)

  assert.deepEqual(variable.map((field) => field.key), OTP_VARIABLE_LEGAL_TEXT_FIELDS)
  assert.ok(variable.every((field) => field.bindingMode === 'docxtemplater'))
})

test('maps repeated parties and leaves actual signatures to the signing overlay', () => {
  const manifest = buildOtpCanonicalTemplateManifest()
  const byKey = new Map(manifest.fields.map((field) => [field.key, field]))

  assert.equal(byKey.get('purchaser_1.full_name').slots.length, 1)
  assert.equal(byKey.get('purchaser_2.full_name').slots.length, 1)
  assert.equal(byKey.get('seller_1.full_name').slots.length, 1)
  assert.equal(byKey.get('seller_2.full_name').slots.length, 1)
  assert.equal(byKey.get('signing.parties_and_witnesses').bindingMode, 'signing_overlay')
})

test('preserves known onboarding gaps while preparing their future DOCX slots', () => {
  const manifest = buildOtpCanonicalTemplateManifest()
  const gaps = manifest.fields.filter((field) => field.coverage === 'gap')

  assert.equal(gaps.length, 8)
  assert.ok(gaps.every((field) => field.bindingMode === 'docxtemplater_pending_source'))
  assert.ok(gaps.every((field) => field.slots.length > 0))
})

test('defines deterministic output formatting and blank handling', () => {
  const manifest = buildOtpCanonicalTemplateManifest()
  const byKey = new Map(manifest.fields.map((field) => [field.key, field]))

  assert.equal(manifest.emptyValuePolicy, 'blank_preserve_layout')
  assert.equal(byKey.get('offer.purchase_price').outputFormat.kind, 'currency')
  assert.equal(byKey.get('offer.cash_fulfilment_date').outputFormat.pattern, 'D MMMM YYYY')
  assert.equal(byKey.get('purchaser.marital_status').outputFormat.kind, 'selection_mark')
  assert.equal(byKey.get('conditions.special_conditions').outputFormat.kind, 'multiline_text')
  assert.equal(byKey.get('signing.purchaser_place_and_date').outputFormat.kind, 'signing_date_parts')
  assert.ok(manifest.fields.every((field) => field.emptyValuePolicy === 'blank_preserve_layout'))
  assert.equal(OTP_CANONICAL_FORMATTING_RULES.currency.currency, 'ZAR')
})
