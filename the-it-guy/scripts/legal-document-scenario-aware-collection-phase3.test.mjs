import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  getLegalDocumentScenarioDependentFieldClears,
  resolveLegalDocumentScenarioRequirements,
  sanitizeLegalDocumentScenarioDraft,
} from '../src/core/documents/legalDocumentScenarioRequirements.js'

const otpPanel = await readFile(new URL('../src/components/documents/OtpDraftIntakePanel.jsx', import.meta.url), 'utf8')
const mandatePanel = await readFile(new URL('../src/components/documents/MandateDraftIntakePanel.jsx', import.meta.url), 'utf8')
const workspacePage = await readFile(new URL('../src/pages/LegalDocumentWorkspacePage.jsx', import.meta.url), 'utf8')

const blankOtp = resolveLegalDocumentScenarioRequirements({ packetType: 'otp', draft: {} })
assert.equal(blankOtp.phase, 'routing')
assert.deepEqual(blankOtp.dataFieldKeys, [])
assert.deepEqual(blankOtp.requiredFieldKeys, [
  'sellerEntityType',
  'buyerEntityType',
  'propertyTitleType',
  'financeType',
])

const trustSectionalBond = resolveLegalDocumentScenarioRequirements({
  packetType: 'otp',
  seller: { entityType: 'trust' },
  buyer: { entityType: 'individual', maritalRegime: 'in community of property' },
  property: { titleType: 'sectional title' },
  transaction: { financeType: 'bond' },
  draft: {},
})
for (const field of [
  'sellerTrusteeNames',
  'sellerAuthorityBasis',
  'buyerSpouseFullName',
  'buyerSpouseIdNumber',
  'unitNumber',
  'complexName',
  'bondAmount',
]) {
  assert.ok(trustSectionalBond.requiredFieldKeys.includes(field), field)
}
for (const field of ['sellerResolutionDate', 'erfNumber', 'cashAmount']) {
  assert.ok(!trustSectionalBond.requiredFieldKeys.includes(field), field)
}

const closeCorporation = resolveLegalDocumentScenarioRequirements({
  packetType: 'mandate',
  seller: { entityType: 'close corporation' },
  property: { titleType: 'full title' },
  draft: {},
})
assert.ok(closeCorporation.requiredFieldKeys.includes('sellerResolutionDate'))
assert.ok(closeCorporation.activePackKeys.includes('seller_company_authority_pack'))

assert.deepEqual(getLegalDocumentScenarioDependentFieldClears('financeType', 'cash'), ['bondAmount'])
assert.deepEqual(getLegalDocumentScenarioDependentFieldClears('propertyTitleType', 'full_title'), ['unitNumber', 'complexName'])
assert.ok(getLegalDocumentScenarioDependentFieldClears('buyerEntityType', '').includes('buyerRepresentativeName'))
const sanitized = sanitizeLegalDocumentScenarioDraft({
  sellerEntityType: 'trust',
  sellerResolutionDate: '2026-07-20',
  sellerTrusteeNames: 'A Trustee',
  buyerEntityType: 'company',
  buyerMaritalRegime: 'in_community',
  buyerSpouseFullName: 'Stale spouse',
  propertyTitleType: 'sectional_title',
  erfNumber: 'Stale erf',
  financeType: 'bond',
  cashAmount: 'Stale cash',
})
assert.equal(sanitized.sellerResolutionDate, '')
assert.equal(sanitized.sellerTrusteeNames, 'A Trustee')
assert.equal(sanitized.buyerSpouseFullName, '')
assert.equal(sanitized.erfNumber, '')
assert.equal(sanitized.cashAmount, '')

assert.match(otpPanel, /new Set\(scenarioProfile\.activePackKeys\)/)
assert.match(otpPanel, /getLegalDocumentScenarioDependentFieldClears\(field, value\)/)
assert.match(otpPanel, /buyerIsCompany \|\| buyerIsTrust/)
assert.match(otpPanel, /sellerIsCompany \|\| sellerIsTrust/)
assert.match(otpPanel, /Reload saved details/)
assert.doesNotMatch(otpPanel, /You can still generate a draft with gaps/)
assert.match(mandatePanel, /disabled=\{!attorneyReady \|\| !legalRequirements\.complete\}/)
assert.match(workspacePage, /legalDocumentConflictingFacts: otpScenarioProfile\.conflictingFacts/)
assert.match(workspacePage, /legalDocumentInvalidFacts: otpScenarioProfile\.invalidFacts/)
assert.match(workspacePage, /sanitizeLegalDocumentScenarioDraft\(/)

console.log('Scenario-aware legal document data collection Phase 3 contract passed.')
