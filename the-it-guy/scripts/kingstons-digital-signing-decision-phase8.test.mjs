import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import {
  KINGSTONS_DIGITAL_SIGNING_DECISION,
  KINGSTONS_DIGITAL_SIGNING_DECISION_VERSION,
  buildKingstonsDigitalSigningDecision,
} from '../src/core/kingstons/digitalSigningDecision.js'

const repoRoot = process.cwd()
const agencyPage = fs.readFileSync(path.join(repoRoot, 'src/pages/agency/AgencyPipelinePage.jsx'), 'utf8')
const listingPage = fs.readFileSync(path.join(repoRoot, 'src/pages/AgentListingDetail.jsx'), 'utf8')
const removedPauseLabel = ['Digital signing', 'paused'].join(' ')
const removedSellerPackAction = ['Upload the signed Seller Pack documents', 'instead.'].join(' ')

function assertIncludes(source, snippet, message) {
  assert.ok(source.includes(snippet), message)
}

assert.equal(KINGSTONS_DIGITAL_SIGNING_DECISION_VERSION, 'kingstons_digital_signing_decision_phase8_v1')
assert.equal(KINGSTONS_DIGITAL_SIGNING_DECISION.status, 'paused')
assert.equal(KINGSTONS_DIGITAL_SIGNING_DECISION.livePath, 'manual_seller_pack')
assert.equal(KINGSTONS_DIGITAL_SIGNING_DECISION.label, '')
assert.equal(KINGSTONS_DIGITAL_SIGNING_DECISION.agentAction, '')

const kingstonsDecision = buildKingstonsDigitalSigningDecision({
  isKingstons: true,
  requestedAction: 'mandate_signing',
})
assert.equal(kingstonsDecision.blocked, true)
assert.equal(kingstonsDecision.status, 'paused')
assert.equal(kingstonsDecision.message, '')

const ordinaryDecision = buildKingstonsDigitalSigningDecision({
  isKingstons: false,
  requestedAction: 'mandate_signing',
})
assert.equal(ordinaryDecision.blocked, false)
assert.equal(ordinaryDecision.status, 'available')

assertIncludes(
  agencyPage,
  'buildKingstonsDigitalSigningDecision',
  'Lead workspace must consume the Kingston digital signing decision contract.',
)
assertIncludes(
  agencyPage,
  'const selectedLeadKingstonsDigitalSigningDecision = useMemo',
  'Lead workspace must memoize the Kingston digital signing decision.',
)
assertIncludes(
  agencyPage,
  'if (selectedLeadKingstonsDigitalSigningDecision.blocked)',
  'Lead digital mandate actions must be blocked by the shared decision.',
)
assertIncludes(
  agencyPage,
  "handleLeadWorkspaceTabSelection('documents')",
  'Lead digital mandate blockers must route agents to documents.',
)

assertIncludes(
  listingPage,
  'const listingKingstonsDigitalSigningDecision = useMemo',
  'Listing workspace must memoize the Kingston digital signing decision.',
)
assertIncludes(
  listingPage,
  'if (listingKingstonsDigitalSigningDecision.blocked)',
  'Listing digital mandate starts must be blocked by the shared decision.',
)
assertIncludes(
  listingPage,
  "openSellerWorkspaceSection('documents')",
  'Listing digital mandate blockers must route agents to documents.',
)
assertIncludes(
  listingPage,
  'open={mandateStartOpen && !listingHasKingstonsSellerProcess}',
  'Kingston listings must still suppress the digital mandate start modal.',
)
assert.equal(agencyPage.includes(removedPauseLabel), false)
assert.equal(listingPage.includes(removedPauseLabel), false)
assert.equal(agencyPage.includes(removedSellerPackAction), false)
assert.equal(listingPage.includes(removedSellerPackAction), false)
assert.equal(listingPage.includes('kingstons-listing-digital-signing-decision'), false)

console.log('Kingstons digital signing decision phase 8 guard passed.')
