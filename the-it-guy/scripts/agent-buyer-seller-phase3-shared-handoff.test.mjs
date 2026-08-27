import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { buildClientPortalActivityFeedModel } from '../src/services/clientPortalActivityFeedService.js'
import { buildSignedOtpHandoffReleaseDecision } from '../src/core/transactions/signedOtpHandoffRelease.js'

const appRoot = resolve(import.meta.dirname, '..')
const notificationSource = readFileSync(
  resolve(appRoot, 'src/services/clientPortalNotificationsService.js'),
  'utf8',
)
const pipelineSource = readFileSync(resolve(appRoot, 'src/pages/agency/AgencyPipelinePage.jsx'), 'utf8')
const attorneySource = readFileSync(resolve(appRoot, 'src/pages/AttorneyTransactionDetail.jsx'), 'utf8')

const physicalOtpPortalData = {
  transaction: {
    id: 'transaction-phase3',
    onboarding_status: 'signed_otp_received',
    updated_at: '2026-08-27T12:00:00.000Z',
  },
}

for (const clientRole of ['buyer', 'seller']) {
  const model = buildClientPortalActivityFeedModel({ portalData: physicalOtpPortalData }, clientRole)
  const milestone = model.items.find((item) => item.type === 'otp_signed')

  assert.ok(milestone, `${clientRole} should see the canonical signed OTP milestone.`)
  assert.equal(milestone.title, 'Signed OTP received')
  assert.match(milestone.description, /transaction is now moving into the next handoff/i)
  assert.equal(milestone.visibility, 'client_visible')
  assert.equal(milestone.metadata.audience, 'shared')
  assert.equal(milestone.metadata.source, 'signed_otp_intake')
  assert.equal(milestone.metadata.actionLabel, 'View Progress')
  assert.equal(milestone.metadata.actionRoute, 'progress')
}

const unsignedPacket = {
  transaction: { id: 'transaction-awaiting-signature' },
  otpPacket: { state: 'ready_for_client_signature' },
}
assert.ok(
  buildClientPortalActivityFeedModel({ portalData: unsignedPacket }, 'buyer').items.some((item) => item.type === 'otp_ready'),
  'The existing buyer signing action should remain visible.',
)
assert.equal(
  buildClientPortalActivityFeedModel({ portalData: unsignedPacket }, 'seller').items.some((item) => item.type === 'otp_ready'),
  false,
  'A buyer signing action must not be projected into the seller portal.',
)

const professionalHandoff = buildSignedOtpHandoffReleaseDecision({
  transaction: { id: 'transaction-phase3', finance_type: 'cash' },
})
assert.ok(professionalHandoff.notification.roleTypes.includes('agent'))
assert.match(pipelineSource, /finalizeCanonicalPhysicalSignedOtpWorkflow\(\{/)
assert.match(notificationSource, /otp_signed: 'stage_updated'/)
assert.match(notificationSource, /'otp_ready',\s*'otp_signed'/)
assert.doesNotMatch(attorneySource, /Offer and Transaction Setup evidence carried over/)
assert.match(attorneySource, /Transaction Setup and signed OTP evidence carried over/)

console.log('Agent/buyer/seller Phase 3 shared handoff checks passed.')
