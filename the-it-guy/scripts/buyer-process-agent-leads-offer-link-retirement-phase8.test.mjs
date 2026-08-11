import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const workspaceSource = await readFile(new URL('../src/pages/AgentLeadsPage.jsx', import.meta.url), 'utf8')
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))

assert.ok(
  workspaceSource.includes("const BUYER_ONBOARDING_OTP_TAB_KEY = 'offers'"),
  'buyer workspace should keep the canonical Offers tab key',
)
assert.ok(
  workspaceSource.includes("label: 'Offers'"),
  'buyer workspace should expose Offers as the visible deal progression tab',
)
assert.ok(
  workspaceSource.includes('function DealOfferComposerModal'),
  'buyer workspace should retain the manual offer capture modal for off-platform evidence',
)
assert.ok(
  workspaceSource.includes('Capture Manual Offer'),
  'manual offer capture should be the only offer composer action exposed from the workspace',
)
assert.ok(
  workspaceSource.includes("source: 'manual_offer_capture'"),
  'manual captures should be explicitly tagged as manual offer evidence',
)
assert.ok(
  workspaceSource.includes('lead_workspace_manual_offer_capture'),
  'manual captures should tag viewed-listing history with the manual workspace source',
)
assert.ok(
  workspaceSource.includes('function LeadOfferTransactionConversionPanel'),
  'accepted-offer transaction conversion should remain available after retiring offer links',
)
assert.ok(
  workspaceSource.includes('createTransactionFromAcceptedCanonicalOffer'),
  'accepted offers should still convert through the canonical transaction service',
)

for (const retiredToken of [
  'createOfferPortalSession',
  'function LeadOfferReadinessPanel',
  'Send Offer Link',
  'Send Offer Link to Buyer',
  'Open generated offer link',
  'Post-Viewing Offer Portal Sent',
  '/offers/session',
  'lead_workspace_offer_link',
  'buyer_offer_link',
]) {
  assert.ok(!workspaceSource.includes(retiredToken), `buyer workspace should retire legacy offer-link token: ${retiredToken}`)
}

assert.equal(
  packageJson.scripts?.['test:buyer-process-agent-leads-offer-link-retirement-phase8'],
  'node scripts/buyer-process-agent-leads-offer-link-retirement-phase8.test.mjs',
  'package.json should expose the phase 8 offer-link retirement guard',
)

console.log('Buyer process phase 8 Agent Leads offer-link retirement checks passed')
