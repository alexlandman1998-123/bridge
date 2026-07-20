import assert from 'node:assert/strict'
import test from 'node:test'
import {
  listLegalDocumentPreviewScenarios,
  resolveLegalDocumentPreviewScenario,
} from '../legalDocumentPreviewScenarios.js'
import {
  buildConditionalMasterTemplateSections,
  getConditionalMasterTemplateDefinition,
} from '../conditionalMasterTemplateDefinitions.js'

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

test('offers the four simple legal what-if previews', () => {
  assert.deepEqual(listLegalDocumentPreviewScenarios().map((scenario) => scenario.key), [
    'company',
    'trust',
    'married_in_community',
    'sectional_title',
  ])
})

test('company and trust previews activate their authority packs', () => {
  const company = resolveLegalDocumentPreviewScenario({ scenarioKey: 'company', packetType: 'otp' })
  const trust = resolveLegalDocumentPreviewScenario({ scenarioKey: 'trust', packetType: 'otp' })
  assert.ok(company.profile.activeClausePacks.includes('seller_company_authority_pack'))
  assert.ok(company.profile.activeClausePacks.includes('buyer_company_authority_pack'))
  assert.ok(trust.profile.activeClausePacks.includes('seller_trust_authority_pack'))
  assert.ok(trust.profile.activeClausePacks.includes('buyer_trust_authority_pack'))
})

test('married and sectional previews activate the expected conditional wording', () => {
  const married = resolveLegalDocumentPreviewScenario({ scenarioKey: 'married_in_community', packetType: 'otp' })
  const sectional = resolveLegalDocumentPreviewScenario({ scenarioKey: 'sectional_title', packetType: 'mandate' })
  assert.ok(married.profile.activeClausePacks.includes('seller_spouse_consent_pack'))
  assert.ok(married.profile.activeClausePacks.includes('buyer_spouse_consent_pack'))
  assert.ok(sectional.profile.activeClausePacks.includes('property_sectional_title_pack'))
  assert.equal(sectional.profile.complete, true)
})

test('custom OTP preview projects exact wording and signers through the runtime engines', () => {
  const preview = resolveLegalDocumentPreviewScenario({
    scenarioKey: 'company',
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

  assert.equal(preview.previewVersion, 'legal-document-scenario-preview-v1')
  assert.equal(preview.ready, true)
  assert.deepEqual(new Set(preview.includedPackKeys), new Set([
    'seller_trust_authority_pack',
    'buyer_individual_capacity_pack',
    'buyer_spouse_consent_pack',
    'property_sectional_title_pack',
    'bond_finance_pack',
    'cash_contribution_pack',
  ]))
  assert.deepEqual(preview.selectedSignerRoles, ['purchaser_1', 'buyer_spouse', 'seller'])
  assert.ok(preview.excludedPackKeys.includes('cash_sale_pack'))
})

test('custom mandate preview hides buyer and finance controls from its canonical decision', () => {
  const preview = resolveLegalDocumentPreviewScenario({
    scenarioKey: 'sectional_title',
    packetType: 'mandate',
    template: template('mandate'),
    selection: {
      sellerEntityType: 'company',
      propertyTitleType: 'sectional_title',
      buyerEntityType: 'trust',
      financeType: 'combination',
    },
  })

  assert.equal(preview.selection.buyerEntityType, '')
  assert.equal(preview.selection.financeType, '')
  assert.deepEqual(preview.selectedSignerRoles, ['seller', 'agent'])
  assert.deepEqual(new Set(preview.includedPackKeys), new Set([
    'seller_company_authority_pack',
    'property_sectional_title_pack',
  ]))
})
