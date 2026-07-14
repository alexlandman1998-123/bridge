import assert from 'node:assert/strict'
import test from 'node:test'
import {
  listLegalDocumentPreviewScenarios,
  resolveLegalDocumentPreviewScenario,
} from '../legalDocumentPreviewScenarios.js'

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
