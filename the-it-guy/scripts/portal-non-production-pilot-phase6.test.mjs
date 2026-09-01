import assert from 'node:assert/strict'
import { PORTAL_PILOT_BROWSER_ROLES, PORTAL_PILOT_SYNC_ROLES } from '../src/core/clientPortal/portalPilotReleaseGate.js'
import { buildPortalNonProductionPilotReceipt } from '../src/core/clientPortal/portalNonProductionPilotReceipt.js'

const phase5Gate = { decision: 'ready_for_internal_pilot', readyForInternalPilot: true }
const pilot = {
  environment: 'non-production',
  transactionId: 'nonprod-journey-matrix-transaction',
  testDataConfirmed: true,
  maxTransactions: 1,
  operator: 'Portal pilot operator',
  startedAt: '2026-09-01T13:00:00Z',
  completedAt: '2026-09-01T13:30:00Z',
  stopCriteriaConfirmed: true,
  rollbackOwner: 'Portal release owner',
}
const browserEvidence = PORTAL_PILOT_BROWSER_ROLES.map((role) => ({
  role,
  passed: true,
  desktopScreenshot: `evidence/${role}-desktop.png`,
  mobileScreenshot: `evidence/${role}-mobile.png`,
  observedAt: '2026-09-01T13:10:00Z',
}))
const syncEvidence = PORTAL_PILOT_SYNC_ROLES.map((role) => ({
  role,
  passed: true,
  evidenceReference: `evidence/${role}-sync.json`,
  observedAt: '2026-09-01T13:20:00Z',
}))

const receipt = buildPortalNonProductionPilotReceipt({
  phase5Gate,
  pilot,
  browserEvidence,
  syncEvidence,
  incident: { open: false, summary: 'No incidents observed.' },
})
assert.equal(receipt.decision, 'non_production_pilot_evidence_recorded')
assert.equal(receipt.passed, true)
assert.equal(receipt.productionReleaseAllowed, false)
assert.deepEqual(receipt.blockers, [])

const missingScreenshot = buildPortalNonProductionPilotReceipt({
  phase5Gate,
  pilot,
  browserEvidence: browserEvidence.map((row) => row.role === 'seller' ? { ...row, mobileScreenshot: '' } : row),
  syncEvidence,
  incident: { open: false, summary: 'No incidents observed.' },
})
assert.ok(missingScreenshot.blockers.includes('seller_browser_evidence_incomplete'))

const unsafePilot = buildPortalNonProductionPilotReceipt({
  phase5Gate,
  pilot: { ...pilot, environment: 'production', maxTransactions: 2, testDataConfirmed: false },
  browserEvidence,
  syncEvidence,
  incident: { open: true },
})
assert.equal(unsafePilot.decision, 'blocked')
assert.ok(unsafePilot.blockers.includes('non_production_environment_required'))
assert.ok(unsafePilot.blockers.includes('single_transaction_limit_required'))
assert.ok(unsafePilot.blockers.includes('test_data_confirmation_required'))
assert.ok(unsafePilot.blockers.includes('open_pilot_incident'))

console.log('portal non-production pilot phase 6 checks passed')
