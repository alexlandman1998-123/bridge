import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  assessPlatformDefaultScenarioLogic,
  PLATFORM_DEFAULT_SCENARIO_MATRIX_PHASE6,
} from '../src/core/documents/platformDefaultScenarioLogic.js'
import {
  resolveConditionalPackDataRequirements,
} from '../src/core/documents/conditionalPackDataRules.js'
import {
  resolveLegalDocumentScenarioProfile,
} from '../src/core/documents/legalDocumentScenarioProfile.js'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const packetService = await readFile(new URL('../src/core/documents/packetService.js', import.meta.url), 'utf8')
const previewScenarios = await readFile(new URL('../src/core/documents/legalDocumentPreviewScenarios.js', import.meta.url), 'utf8')
const phase1Doc = await readFile(new URL('../../docs/legal-template-platform-defaults-phase1.md', import.meta.url), 'utf8')

function keys(rows = []) {
  return rows.map((row) => row.key)
}

function assertIncludes(actual = [], expected = [], label = 'values') {
  for (const value of expected) {
    assert.ok(actual.includes(value), `${label}: expected ${value}`)
  }
}

function assertExcludes(actual = [], forbidden = [], label = 'values') {
  for (const value of forbidden) {
    assert.equal(actual.includes(value), false, `${label}: did not expect ${value}`)
  }
}

assert.equal(
  packageJson.scripts?.['test:legal-template-platform-defaults-phase6'],
  'node scripts/legal-template-platform-defaults-phase6.test.mjs',
  'package.json should expose the Phase 6 platform-default scenario contract.',
)

assert.equal(PLATFORM_DEFAULT_SCENARIO_MATRIX_PHASE6.length, 9, 'Phase 6 should exercise mandate and OTP platform-default scenarios.')

const report = assessPlatformDefaultScenarioLogic()
assert.equal(report.ready, true, JSON.stringify(report.blockers, null, 2))
assert.equal(report.contract, 'legal-template-platform-default-scenario-logic-v1')

const mandateWithBuyerSignals = resolveLegalDocumentScenarioProfile({
  packetType: 'mandate',
  placeholders: {
    seller_entity_type: 'company',
    buyer_entity_type: 'trust',
    property_title_type: 'full_title',
    finance_type: 'bond',
  },
})
assert.equal(mandateWithBuyerSignals.complete, true)
assertIncludes(mandateWithBuyerSignals.activeClausePacks, ['seller_company_authority_pack', 'property_full_title_pack'], 'mandate packs')
assertExcludes(
  mandateWithBuyerSignals.activeClausePacks,
  ['buyer_trust_authority_pack', 'buyer_company_authority_pack', 'bond_finance_pack', 'cash_sale_pack'],
  'mandate packs',
)
assert.equal(mandateWithBuyerSignals.buyerClauseProfile, '')
assert.equal(mandateWithBuyerSignals.financeClauseProfile, '')

const closeCorporationOtp = resolveLegalDocumentScenarioProfile({
  packetType: 'otp',
  placeholders: {
    seller_entity_type: 'close corporation',
    buyer_entity_type: 'close_corporation',
    property_title_type: 'sectional_title',
    finance_type: 'combination',
  },
})
assert.equal(closeCorporationOtp.complete, true)
assertIncludes(
  closeCorporationOtp.activeClausePacks,
  ['seller_company_authority_pack', 'buyer_company_authority_pack', 'property_sectional_title_pack', 'bond_finance_pack'],
  'close corporation OTP packs',
)

const mandateConditionalRules = keys(resolveConditionalPackDataRequirements({
  packetType: 'mandate',
  placeholders: {
    seller_entity_type: 'trust',
    buyer_entity_type: 'company',
    finance_type: 'cash',
  },
}))
assert.deepEqual(mandateConditionalRules, ['seller_trust_authority_pack'], 'Mandate conditional rules must ignore buyer and finance facts.')

const otpConditionalRules = keys(resolveConditionalPackDataRequirements({
  packetType: 'otp',
  placeholders: {
    seller_entity_type: 'trust',
    buyer_entity_type: 'company',
    finance_type: 'cash',
  },
}))
assertIncludes(otpConditionalRules, ['seller_trust_authority_pack', 'buyer_company_authority_pack', 'cash_sale_pack'], 'OTP conditional rules')

for (const token of [
  'resolveConditionalPackAudit',
  'conditionalPackDataRequirements,',
  'conditionalPackMissingPlaceholders,',
  'conditionalPackAudit,',
  'legalDocumentScenarioProfile',
  'buildLegalDocumentScenarioPlaceholders',
]) {
  assert.ok(packetService.includes(token), `packetService should carry scenario/conditional logic into generation: ${token}`)
}

for (const token of [
  'company',
  'trust',
  'married_in_community',
  'sectional_title',
  'resolveLegalDocumentScenarioProfile',
]) {
  assert.ok(previewScenarios.includes(token), `Legal previews should expose scenario probes: ${token}`)
}

for (const token of [
  'Mandate smart logic is seller and agency focused',
  'OTP smart logic is transaction-party focused',
  'buyer individual, company, trust, or close corporation',
]) {
  assert.ok(phase1Doc.includes(token), `Phase 1 product rule should state the Phase 6 boundary: ${token}`)
}

console.log('Legal template platform defaults Phase 6 contract passed.')
