import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  buildConditionalMasterTemplateSections,
  getConditionalMasterTemplateDefinition,
} from '../src/core/documents/conditionalMasterTemplateDefinitions.js'
import {
  LEGAL_DOCUMENT_SCENARIO_PREVIEW_VERSION,
  resolveLegalDocumentPreviewScenario,
} from '../src/core/documents/legalDocumentPreviewScenarios.js'

function template(packetType) {
  const definition = getConditionalMasterTemplateDefinition(packetType)
  return {
    packet_type: packetType,
    metadata_json: { default_signer_roles: definition.defaultSignerRoles },
    sections: buildConditionalMasterTemplateSections(packetType, [
      { sectionKey: 'parties', legalText: 'Parties' },
      { sectionKey: 'signature_pages', legalText: 'Signatures' },
    ]),
  }
}

const preview = resolveLegalDocumentPreviewScenario({
  packetType: 'otp',
  template: template('otp'),
  selection: {
    sellerEntityType: 'trust',
    buyerEntityType: 'individual',
    buyerMaritalRegime: 'in_community',
    propertyTitleType: 'sectional_title',
    financeType: 'combination',
  },
})

assert.equal(preview.previewVersion, LEGAL_DOCUMENT_SCENARIO_PREVIEW_VERSION)
assert.equal(preview.ready, true)
assert.deepEqual(new Set(preview.includedPackKeys), new Set([
  'seller_trust_authority_pack',
  'buyer_individual_capacity_pack',
  'buyer_spouse_consent_pack',
  'property_sectional_title_pack',
  'bond_finance_pack',
  'cash_contribution_pack',
]))
assert.ok(preview.excludedPackKeys.includes('cash_sale_pack'))
assert.deepEqual(preview.selectedSignerRoles, ['purchaser_1', 'buyer_spouse', 'seller'])

const model = await readFile(new URL('../src/core/documents/legalDocumentPreviewScenarios.js', import.meta.url), 'utf8')
const dedicatedPreview = await readFile(new URL('../src/pages/settings/LegalDocumentPreviewPage.jsx', import.meta.url), 'utf8')
const editor = await readFile(new URL('../src/pages/settings/SettingsSigningTemplatesPage.jsx', import.meta.url), 'utf8')
const adr = await readFile(new URL('../docs/architecture/adr-002-conditional-master-legal-documents.md', import.meta.url), 'utf8')

for (const token of [
  'LEGAL_DOCUMENT_PREVIEW_OPTIONS',
  'evaluateConditionalMasterSections',
  'evaluateConditionalSigningPlan',
]) {
  assert.ok(model.includes(token), `Canonical scenario preview model should include ${token}.`)
}

for (const token of [
  'Adjust the facts',
  'Excluded wording',
  'Who signs',
  'sellerEntityType',
  'buyerEntityType',
  'propertyTitleType',
  'financeType',
]) {
  assert.ok(dedicatedPreview.includes(token), `Dedicated preview should include ${token}.`)
}

for (const token of [
  'aria-label="Preview legal scenario"',
  'scenarioProfile',
  'conditionalMasterAudit',
  'signingAudit',
]) {
  assert.ok(editor.includes(token), `Current-edits preview should include ${token}.`)
}

assert.match(adr, /Scenario preview does not maintain a second set of conditional rules\./)

console.log('Legal-document scenario preview Phase 9 contract passed.')
