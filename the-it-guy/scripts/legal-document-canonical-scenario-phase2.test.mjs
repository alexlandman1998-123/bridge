import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  resolveCanonicalLegalDocumentScenario,
} from '../src/core/documents/legalDocumentScenarioProfile.js'
import { normalizeDocumentStartLegalScenario } from '../src/core/documents/documentStartLegalScenario.js'
import {
  normalizeDealFinanceType,
  normalizeDocumentPartyEntityType,
} from '../src/core/documents/documentPartyClassification.js'

const packetService = await readFile(new URL('../src/core/documents/packetService.js', import.meta.url), 'utf8')
const documentStart = await readFile(new URL('../src/core/documents/documentStartLegalScenario.js', import.meta.url), 'utf8')
const packetWorkflow = await readFile(new URL('../src/core/documents/packetWorkflow.js', import.meta.url), 'utf8')
const workspacePage = await readFile(new URL('../src/pages/LegalDocumentWorkspacePage.jsx', import.meta.url), 'utf8')

const blankOtp = resolveCanonicalLegalDocumentScenario({ packetType: 'otp' })
assert.equal(blankOtp.complete, false)
assert.deepEqual(blankOtp.activePackKeys, [])
assert.deepEqual(blankOtp.missingFacts, [
  'seller_entity_type',
  'buyer_entity_type',
  'property_title_type',
  'finance_type',
])
assert.equal(normalizeDocumentPartyEntityType(''), '')
assert.equal(normalizeDealFinanceType(''), '')

const conflict = resolveCanonicalLegalDocumentScenario({
  packetType: 'mandate',
  placeholders: { seller_entity_type: 'company', property_title_type: 'full_title' },
  seller: { entityType: 'trust' },
})
assert.equal(conflict.complete, false)
assert.deepEqual(conflict.conflictingFacts.map((fact) => fact.field), ['seller_entity_type'])
assert.equal(conflict.sourceProvenance.seller_entity_type.source, 'placeholders')

const otp = resolveCanonicalLegalDocumentScenario({
  packetType: 'otp',
  seller: { entityType: 'close corporation' },
  buyer: { entityType: 'individual', maritalRegime: 'in community of property' },
  property: { titleType: 'share block' },
  transaction: { financeType: 'cash and bond' },
})
assert.equal(otp.complete, true)
assert.equal(otp.sellerEntityType, 'close_corporation')
assert.equal(otp.sellerClauseProfile, 'company')
assert.equal(otp.propertyTitleType, 'sectional_title')
assert.equal(otp.financeType, 'combination')
assert.ok(otp.activePackKeys.includes('seller_company_authority_pack'))
assert.ok(otp.activePackKeys.includes('buyer_spouse_consent_pack'))
assert.ok(otp.activePackKeys.includes('cash_contribution_pack'))

const startScenario = normalizeDocumentStartLegalScenario({
  sellerEntityType: 'company',
  propertyTitleType: 'full_title',
}, 'mandate')
assert.equal(startScenario.resolverVersion, 'canonical_legal_document_scenario_v1')
assert.match(documentStart, /resolveCanonicalLegalDocumentScenario\(/)
assert.doesNotMatch(documentStart, /function getPartyProfile\(/)
assert.doesNotMatch(packetWorkflow, /purchaser_type \|\| 'individual'/)
assert.doesNotMatch(packetWorkflow, /seller_type \|\| 'company'/)
assert.doesNotMatch(packetWorkflow, /finance_type \|\| 'cash'/)
assert.doesNotMatch(workspacePage, /propertyTitleType \|\| \(draft\.unitNumber/)

for (const token of [
  'legalDocumentConflictingFacts',
  'legalDocumentInvalidFacts',
  'legalDocumentScenarioProvenance',
  "source: 'legal_scenario_conflict'",
  "source: 'legal_scenario_invalid'",
]) {
  assert.ok(packetService.includes(token), `Generation validation should expose ${token}.`)
}

console.log('Canonical legal document scenario Phase 2 contract passed.')
