import assert from 'node:assert/strict'
import test from 'node:test'
import { evaluateConditionalMasterSections } from '../conditionalMasterEngine.js'
import { buildConditionalMasterTemplateSections } from '../conditionalMasterTemplateDefinitions.js'
import {
  buildLegalDocumentScenarioPlaceholders,
  resolveCanonicalLegalDocumentScenario,
} from '../legalDocumentScenarioProfile.js'
import { evaluateVisibilityRulesDetailed } from '../sectionVisibilityRules.js'

function buildMaster(packetType) {
  return buildConditionalMasterTemplateSections(packetType, [
    { sectionKey: packetType === 'otp' ? 'cover_page' : 'introduction_purpose', sectionLabel: 'Introduction', legalText: 'Standard wording' },
    { sectionKey: 'signature_pages', sectionLabel: 'Signatures', legalText: 'Signatures' },
  ])
}

test('strict visibility rules exclude malformed and unsupported conditions', () => {
  const unsupported = evaluateVisibilityRulesDetailed(
    { field: 'finance_type', operator: 'approximately', value: 'cash' },
    { finance_type: 'cash' },
    { strict: true },
  )
  assert.equal(unsupported.visible, false)
  assert.equal(unsupported.valid, false)
  assert.deepEqual(unsupported.errors.map((error) => error.code), ['VISIBILITY_OPERATOR_UNSUPPORTED'])

  const missingNegative = evaluateVisibilityRulesDetailed(
    { field: 'finance_type', operator: 'not_equals', value: 'cash' },
    {},
    { strict: true },
  )
  assert.equal(missingNegative.valid, true)
  assert.equal(missingNegative.visible, false)

  const emptyEnabledRule = evaluateVisibilityRulesDetailed(
    { enabled: true, rule: {} },
    { finance_type: 'cash' },
    { strict: true },
  )
  assert.equal(emptyEnabledRule.visible, false)
  assert.ok(emptyEnabledRule.errors.some((error) => error.code === 'VISIBILITY_RULE_EMPTY'))
})

test('strict visibility rules detect contradictory alias values', () => {
  const result = evaluateVisibilityRulesDetailed(
    { field: 'seller_entity_type', operator: 'equals', value: 'company' },
    { seller_entity_type: 'company', sellerEntityType: 'trust' },
    { strict: true },
  )
  assert.equal(result.visible, false)
  assert.equal(result.valid, false)
  assert.ok(result.errors.some((error) => error.code === 'VISIBILITY_FIELD_CONFLICT'))
})

test('conditional master engine includes exactly the canonical resolver pack set', () => {
  const profile = resolveCanonicalLegalDocumentScenario({
    packetType: 'otp',
    seller: { entityType: 'trust' },
    buyer: { entityType: 'individual', maritalRegime: 'in community of property' },
    property: { titleType: 'sectional title' },
    transaction: { financeType: 'combination' },
  })
  const result = evaluateConditionalMasterSections({
    packetType: 'otp',
    sections: buildMaster('otp'),
    placeholders: buildLegalDocumentScenarioPlaceholders(profile),
    scenarioProfile: profile,
  })

  assert.equal(result.canProceed, true)
  assert.deepEqual(new Set(result.includedPackKeys), new Set(profile.activeClausePacks))
  assert.ok(result.includedSectionKeys.includes('cover_page'))
  assert.ok(result.includedSectionKeys.includes('signature_pages'))
  assert.ok(result.excludedPackKeys.includes('cash_sale_pack'))
})

test('conditional master engine blocks rule drift even when the changed rule matches', () => {
  const profile = resolveCanonicalLegalDocumentScenario({
    packetType: 'mandate',
    seller: { entityType: 'company' },
    property: { titleType: 'full title' },
  })
  const sections = buildMaster('mandate').map((section) => (
    section.sectionKey === 'seller_company_authority_pack'
      ? { ...section, conditionJson: { enabled: true, rule: { field: 'seller_entity_type', operator: 'contains', value: 'company' } } }
      : section
  ))
  const result = evaluateConditionalMasterSections({
    packetType: 'mandate',
    sections,
    placeholders: buildLegalDocumentScenarioPlaceholders(profile),
    scenarioProfile: profile,
  })

  assert.equal(result.canProceed, false)
  assert.ok(result.issues.some((issue) => issue.code === 'CONDITIONAL_RULE_DRIFT'))
  assert.ok(!result.includedPackKeys.includes('seller_company_authority_pack'))
})

test('conditional master engine fails closed until the canonical scenario is complete', () => {
  const profile = resolveCanonicalLegalDocumentScenario({
    packetType: 'otp',
    seller: { entityType: 'company' },
    property: { titleType: 'full title' },
  })
  const result = evaluateConditionalMasterSections({
    packetType: 'otp',
    sections: buildMaster('otp'),
    placeholders: buildLegalDocumentScenarioPlaceholders(profile),
    scenarioProfile: profile,
  })

  assert.equal(result.canProceed, false)
  assert.ok(result.issues.some((issue) => issue.code === 'CONDITIONAL_SCENARIO_INCOMPLETE'))
  assert.deepEqual(result.includedPackKeys, [])
})
