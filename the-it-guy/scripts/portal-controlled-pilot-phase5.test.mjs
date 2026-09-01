import assert from 'node:assert/strict'
import {
  PORTAL_PILOT_BROWSER_ROLES,
  PORTAL_PILOT_SYNC_ROLES,
  buildPortalPilotReleaseGate,
} from '../src/core/clientPortal/portalPilotReleaseGate.js'

const walkthroughs = PORTAL_PILOT_BROWSER_ROLES.map((role) => ({
  role,
  desktopPassed: true,
  mobilePassed: true,
  primaryActionsPassed: true,
  recoveryPassed: true,
  ...(role === 'buyer' || role === 'seller' ? { uploadPassed: true } : {}),
}))

const syncEvidence = PORTAL_PILOT_SYNC_ROLES.map((role) => ({
  role,
  activitySynced: true,
  visibilityIsolated: true,
  refreshPersisted: true,
}))

const ready = buildPortalPilotReleaseGate({
  environment: 'non-production',
  transactionId: 'nonprod-journey-matrix-transaction',
  reviewedBy: 'Portal release owner',
  reviewedAt: '2026-09-01T12:00:00Z',
  walkthroughs,
  syncEvidence,
  findings: [{ severity: 'warning', owner: 'Portal release owner', dueDate: '2026-09-08', detail: 'Observe the first pilot batch.' }],
})

assert.equal(ready.decision, 'ready_for_internal_pilot')
assert.equal(ready.readyForInternalPilot, true)
assert.equal(ready.productionReleaseAllowed, false)
assert.deepEqual(ready.blockers, [])

const missingMobile = buildPortalPilotReleaseGate({
  environment: 'non-production',
  transactionId: 'nonprod-journey-matrix-transaction',
  reviewedBy: 'Portal release owner',
  reviewedAt: '2026-09-01T12:00:00Z',
  walkthroughs: walkthroughs.map((row) => row.role === 'seller' ? { ...row, mobilePassed: false } : row),
  syncEvidence,
})
assert.equal(missingMobile.decision, 'blocked')
assert.ok(missingMobile.blockers.includes('seller_walkthrough_incomplete'))

const productionAttempt = buildPortalPilotReleaseGate({
  environment: 'production',
  transactionId: 'production-transaction',
  reviewedBy: 'Portal release owner',
  reviewedAt: '2026-09-01T12:00:00Z',
  walkthroughs,
  syncEvidence,
})
assert.equal(productionAttempt.decision, 'blocked')
assert.equal(productionAttempt.productionReleaseAllowed, false)
assert.ok(productionAttempt.blockers.includes('non_production_environment_required'))

const unownedWarning = buildPortalPilotReleaseGate({
  environment: 'non-production',
  transactionId: 'nonprod-journey-matrix-transaction',
  reviewedBy: 'Portal release owner',
  reviewedAt: '2026-09-01T12:00:00Z',
  walkthroughs,
  syncEvidence,
  findings: [{ severity: 'warning', detail: 'Needs an accountable owner.' }],
})
assert.ok(unownedWarning.blockers.includes('warning_without_owner_or_due_date'))

console.log('portal controlled pilot phase 5 checks passed')
