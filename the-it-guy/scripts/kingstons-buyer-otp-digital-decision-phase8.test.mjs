import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
  KINGSTONS_BUYER_OTP_DIGITAL_DECISION,
  KINGSTONS_BUYER_OTP_DIGITAL_DECISION_VERSION,
  buildKingstonsBuyerOtpDigitalDecision,
} from '../src/core/transactions/kingstonsBuyerOtpReadiness.js'

const repoRoot = process.cwd()
const readinessSource = fs.readFileSync(path.join(repoRoot, 'src/core/transactions/kingstonsBuyerOtpReadiness.js'), 'utf8')
const listingPageSource = fs.readFileSync(path.join(repoRoot, 'src/pages/AgentListingDetail.jsx'), 'utf8')
const unitDetailSource = fs.readFileSync(path.join(repoRoot, 'src/pages/UnitDetail.jsx'), 'utf8')
const phase7GuardSource = fs.readFileSync(path.join(repoRoot, 'scripts/kingstons-buyer-otp-buyer-portal-decision-phase7.test.mjs'), 'utf8')

function assertIncludes(source, snippet, message) {
  assert.ok(source.includes(snippet), message)
}

assert.equal(KINGSTONS_BUYER_OTP_DIGITAL_DECISION_VERSION, 'kingstons_buyer_otp_digital_decision_phase8_v1')
assert.equal(KINGSTONS_BUYER_OTP_DIGITAL_DECISION.status, 'paused')
assert.equal(KINGSTONS_BUYER_OTP_DIGITAL_DECISION.livePath, 'manual_buyer_otp_upload')
assert.equal(KINGSTONS_BUYER_OTP_DIGITAL_DECISION.agentAction, '')

const kingstonsDecision = buildKingstonsBuyerOtpDigitalDecision({
  isKingstons: true,
  requestedAction: 'accepted_offer_otp_generation_and_signing',
})
assert.equal(kingstonsDecision.blocked, true)
assert.equal(kingstonsDecision.digitalOtpEnabled, false)
assert.equal(kingstonsDecision.message, '')

const ordinaryDecision = buildKingstonsBuyerOtpDigitalDecision({
  isKingstons: false,
  requestedAction: 'accepted_offer_otp_generation_and_signing',
})
assert.equal(ordinaryDecision.blocked, false)
assert.equal(ordinaryDecision.status, 'available')
assert.equal(ordinaryDecision.digitalOtpEnabled, true)

assertIncludes(readinessSource, 'export function buildKingstonsBuyerOtpDigitalDecision', 'Buyer OTP readiness contract must expose the Phase 8 digital decision.')
assertIncludes(readinessSource, 'manual_buyer_otp_upload', 'Phase 8 must keep manual buyer OTP upload as the live path.')
assertIncludes(listingPageSource, 'const listingKingstonsBuyerOtpDigitalDecision = useMemo', 'Listing workspace must memoize the buyer OTP digital decision.')
assertIncludes(listingPageSource, 'handleAcceptedOfferPrepareOtpClick', 'Listing workspace must route Prepare OTP through the Phase 8 decision.')
assertIncludes(listingPageSource, 'open={Boolean(acceptedOfferOtpStartOffer) && !listingKingstonsBuyerOtpDigitalDecision.blocked}', 'Listing workspace must suppress the accepted-offer OTP modal for Kingston.')
assert.ok(!listingPageSource.includes('data-testid="kingstons-buyer-otp-digital-decision"'), 'Listing workspace must not render a visible paused digital OTP warning.')
assert.ok(!listingPageSource.includes('Manual OTP Only'), 'Listing workspace must not label actions with paused digital OTP warning copy.')
assertIncludes(unitDetailSource, 'const kingstonsBuyerOtpDigitalDecision = buildKingstonsBuyerOtpDigitalDecision', 'Transaction workspace must build the Phase 8 decision.')
assertIncludes(unitDetailSource, 'if (kingstonsBuyerOtpDigitalDecision.blocked && [\'generate\', \'send\'].includes(workspaceMode))', 'Transaction workspace must block digital OTP workspace generation/send.')
assertIncludes(unitDetailSource, 'if (kingstonsBuyerOtpDigitalDecision.blocked) {\n      setOtpStartOpen(false)', 'Transaction workspace primary OTP action must block before opening the start modal.')
assertIncludes(unitDetailSource, 'open={otpStartOpen && !kingstonsBuyerOtpDigitalDecision.blocked}', 'Transaction workspace must suppress the OTP start modal for Kingston.')
assertIncludes(unitDetailSource, 'disabled: kingstonsBuyerOtpDigitalDecision.blocked || !salesWorkflowSnapshot.latestGeneratedOtpDocument?.id', 'Transaction workspace must disable approve/send actions while digital OTP is paused.')
assertIncludes(phase7GuardSource, 'digitalOtpEnabled, false', 'Phase 8 must preserve the Phase 7 buyer portal decision that digital OTP is disabled.')

console.log('Kingstons buyer OTP digital decision phase 8 guard passed.')
