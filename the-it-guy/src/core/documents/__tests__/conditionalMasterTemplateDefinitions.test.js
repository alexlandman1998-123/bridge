import assert from 'node:assert/strict'
import test from 'node:test'
import {
  assessConditionalMasterTemplate,
  buildConditionalMasterTemplateSections,
  getConditionalMasterPackDefinitions,
  getConditionalMasterTemplateDefinition,
} from '../conditionalMasterTemplateDefinitions.js'
import {
  buildLegalDocumentScenarioPlaceholders,
  resolveCanonicalLegalDocumentScenario,
} from '../legalDocumentScenarioProfile.js'
import { evaluateVisibilityRules } from '../sectionVisibilityRules.js'

function baseSections(packetType) {
  return [
    { sectionKey: packetType === 'mandate' ? 'introduction_purpose' : 'cover_page', sectionLabel: 'Cover', legalText: 'Base wording', isRequired: true, sortOrder: 0 },
    { sectionKey: 'signature_pages', sectionLabel: 'Signatures', legalText: 'Signature wording', isRequired: true, sortOrder: 99 },
  ]
}

test('defines exactly one conditional master for Mandate and one for OTP', () => {
  const mandate = getConditionalMasterTemplateDefinition('mandate')
  const otp = getConditionalMasterTemplateDefinition('otp')

  assert.equal(mandate.templateKey, 'mandate_default_v1')
  assert.equal(otp.templateKey, 'otp_default_v1')
  assert.equal(mandate.masterVersion, 'conditional-master-v1')
  assert.equal(otp.masterVersion, 'conditional-master-v1')
  assert.equal(mandate.packKeys.length, 6)
  assert.equal(otp.packKeys.length, 13)
  assert.equal(mandate.defaultSignerRoles.filter((role) => role.required).length, 2)
  assert.equal(otp.defaultSignerRoles.filter((role) => role.required).length, 2)
})

test('builds complete locked masters around existing standard wording', () => {
  for (const packetType of ['mandate', 'otp']) {
    const sections = buildConditionalMasterTemplateSections(packetType, baseSections(packetType))
    const assessment = assessConditionalMasterTemplate(packetType, sections)

    assert.equal(assessment.valid, true, packetType)
    assert.equal(sections[0].legalText, 'Base wording')
    assert.equal(sections.at(-1).sectionKey, 'signature_pages')
    assert.equal(new Set(sections.map((section) => section.sectionKey)).size, sections.length)
  }
})

test('renders the same pack set selected by the canonical resolver', () => {
  const scenarios = [
    {
      packetType: 'mandate',
      seller: { entityType: 'individual', maritalRegime: 'in community of property' },
      property: { titleType: 'sectional title' },
    },
    {
      packetType: 'mandate',
      seller: { entityType: 'close corporation' },
      property: { titleType: 'full title' },
    },
    {
      packetType: 'otp',
      seller: { entityType: 'trust' },
      buyer: { entityType: 'company' },
      property: { titleType: 'full title' },
      transaction: { financeType: 'cash' },
    },
    {
      packetType: 'otp',
      seller: { entityType: 'company' },
      buyer: { entityType: 'individual', maritalRegime: 'in community of property' },
      property: { titleType: 'sectional title' },
      transaction: { financeType: 'combination' },
    },
  ]

  for (const scenario of scenarios) {
    const profile = resolveCanonicalLegalDocumentScenario(scenario)
    const placeholders = buildLegalDocumentScenarioPlaceholders(profile)
    const visiblePackKeys = getConditionalMasterPackDefinitions(scenario.packetType)
      .filter((section) => evaluateVisibilityRules(section.conditionJson, placeholders))
      .map((section) => section.key)

    assert.deepEqual(new Set(visiblePackKeys), new Set(profile.activePackKeys), profile.scenarioKey)
  }
})

test('combination finance activates both bond and cash-contribution wording', () => {
  const profile = resolveCanonicalLegalDocumentScenario({
    packetType: 'otp',
    seller: { entityType: 'company' },
    buyer: { entityType: 'company' },
    property: { titleType: 'full_title' },
    transaction: { financeType: 'combination' },
  })

  assert.ok(profile.activePackKeys.includes('bond_finance_pack'))
  assert.ok(profile.activePackKeys.includes('cash_contribution_pack'))
  assert.ok(!profile.activePackKeys.includes('cash_sale_pack'))
})
