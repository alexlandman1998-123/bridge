import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import { evaluateConditionalSigningPlan } from '../src/core/documents/conditionalSigningEngine.js'

const packetService = await readFile(new URL('../src/core/documents/packetService.js', import.meta.url), 'utf8')
const envelope = await readFile(new URL('../src/core/documents/signingEnvelopeAssurance.js', import.meta.url), 'utf8')
const workspace = await readFile(new URL('../src/components/documents/LegalDocumentWorkspace.jsx', import.meta.url), 'utf8')
const adr = await readFile(new URL('../docs/architecture/adr-002-conditional-master-legal-documents.md', import.meta.url), 'utf8')

const audit = evaluateConditionalSigningPlan({
  packetType: 'otp',
  placeholders: {
    buyer_entity_type: 'individual',
    buyer_marital_regime: 'in_community',
    buyer_full_name: 'Buyer',
    buyer_email: 'buyer@example.com',
    buyer_spouse_full_name: 'Buyer Spouse',
    buyer_spouse_email: 'buyer-spouse@example.com',
    seller_entity_type: 'company',
    seller_representative_name: 'Seller Director',
    seller_representative_email: 'director@seller.example',
    property_title_type: 'sectional_title',
    finance_type: 'combination',
  },
})

assert.deepEqual(audit.selectedSignerRoles, ['purchaser_1', 'buyer_spouse', 'seller'])
assert.equal(audit.engineVersion, 'conditional-signing-engine-v1')
assert.equal(audit.canPrepareSigning, true)

for (const token of [
  'evaluateConditionalSigningPlan({',
  'conditionalSigningAudit',
  'CONDITIONAL_SIGNING_PLAN_BLOCKED',
  'CONDITIONAL_SIGNING_ROSTER_MISMATCH',
  'conditionalSigningDecisionHash',
  'hasConditionalSigningBlockingIssues',
  'targetVersion?.placeholders_resolved_json',
]) {
  assert.ok(packetService.includes(token), `Packet signing should include ${token}.`)
}

assert.ok(envelope.includes('E3_UNEXPECTED_SCENARIO_SIGNER'))
assert.ok(envelope.includes('conditionalSigningAudit'))
assert.ok(workspace.includes('isMandatePacket || isOtpPacket'))
assert.match(adr, /The generated version's resolved placeholders are the signing source of truth\./)

console.log('Conditional legal-document signing Phase 7 contract passed.')
