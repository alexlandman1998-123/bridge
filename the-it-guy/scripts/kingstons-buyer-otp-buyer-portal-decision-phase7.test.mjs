import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
  KINGSTONS_BUYER_PORTAL_DECISION_VERSION,
  buildKingstonsBuyerOtpReadiness,
  buildKingstonsBuyerPortalDecision,
} from '../src/core/transactions/kingstonsBuyerOtpReadiness.js'

const repoRoot = process.cwd()
const readinessSource = fs.readFileSync(path.join(repoRoot, 'src/core/transactions/kingstonsBuyerOtpReadiness.js'), 'utf8')
const unitDetailSource = fs.readFileSync(path.join(repoRoot, 'src/pages/UnitDetail.jsx'), 'utf8')

function assertIncludes(source, snippet, message) {
  assert.ok(source.includes(snippet), message)
}

const readiness = buildKingstonsBuyerOtpReadiness({
  documents: [{
    id: 'manual-signed-otp',
    document_type: 'signed_otp',
    name: 'Signed OTP - Kingston Buyer.pdf',
    storage_path: 'private-listings/listing-1/manual-signed-otp.pdf',
    status: 'uploaded',
  }],
})

const decision = buildKingstonsBuyerPortalDecision({ readiness })

assert.equal(KINGSTONS_BUYER_PORTAL_DECISION_VERSION, 'kingstons_buyer_portal_decision_phase7_v1')
assert.equal(decision.mode, 'manual_internal')
assert.equal(decision.buyerPortalEnabled, false)
assert.equal(decision.onboardingLinkEnabled, false)
assert.equal(decision.digitalOtpEnabled, false)
assert.equal(decision.manualUploadRequired, true)
assert.equal(decision.actionLabel, 'Upload Signed OTP')
assert.match(decision.reason, /agent upload/i)

assertIncludes(readinessSource, 'export function buildKingstonsBuyerPortalDecision', 'Kingston buyer portal decision must live with the OTP readiness contract.')
assertIncludes(readinessSource, 'buyerPortalEnabled: false', 'Kingston buyer portal must remain disabled for the manual OTP lane.')
assertIncludes(readinessSource, 'onboardingLinkEnabled: false', 'Kingston buyer onboarding links must remain disabled for the manual OTP lane.')
assertIncludes(unitDetailSource, 'buildKingstonsBuyerPortalDecision', 'Transaction workspace must consume the Kingston buyer portal decision.')
assertIncludes(unitDetailSource, 'kingstonsBuyerPortalLinksDisabled', 'Transaction workspace must derive a portal-link disable flag.')
assertIncludes(unitDetailSource, 'kingstonsBuyerOnboardingLinksDisabled', 'Transaction workspace must derive an onboarding-link disable flag.')
assertIncludes(unitDetailSource, 'throw new Error(kingstonsBuyerPortalDecisionReason)', 'Transaction workspace handlers must block generating links for Kingston manual OTP.')
assertIncludes(unitDetailSource, 'if (kingstonsBuyerOnboardingLinksDisabled) {\n        throw new Error(kingstonsBuyerPortalDecisionReason)\n      }\n      const record = detail?.onboarding?.token', 'Copy onboarding must be blocked even when an onboarding token already exists.')
assertIncludes(unitDetailSource, 'label: kingstonsBuyerPortalLinksDisabled ? \'Manual OTP Only\' : \'Client Portal\'', 'Workspace actions must show the manual OTP decision instead of a normal portal prompt.')
assertIncludes(unitDetailSource, '!onboardingComplete && onboardingMode !== \'manual\' && !kingstonsBuyerOnboardingLinksDisabled', 'Onboarding panel must not expose the open onboarding button for Kingston manual OTP.')

console.log('Kingstons buyer OTP buyer portal decision phase 7 guard passed.')
