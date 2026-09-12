import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildTransferTaxPhase8ReleaseGate,
  TRANSFER_TAX_PHASE8_REQUIRED_MIGRATIONS,
} from '../attorneyWorkflow/transferTaxPhase8ReleaseGate.js'

const approvedPhase7 = { ready: true, status: 'ROLE_SYNC_READY' }
const roles = ['attorney', 'developer', 'agent', 'buyer', 'seller']
const smokes = roles.map((role) => ({ role, passed: true, evidencePath: `evidence/${role}.json` }))
const rollback = { owner: 'release-owner', runbookPath: 'runbooks/transfer-tax.md', killSwitchVerified: true }

test('holds promotion until migrations, role assurance, smoke evidence and rollback are all present', () => {
  const report = buildTransferTaxPhase8ReleaseGate({
    phase7Report: approvedPhase7,
    appliedMigrations: TRANSFER_TAX_PHASE8_REQUIRED_MIGRATIONS.slice(0, -1),
    environment: 'production',
    smokeChecks: smokes.slice(0, -1),
    rollback,
  })
  assert.equal(report.releaseReady, false)
  assert.ok(report.blockers.some((blocker) => blocker.code === 'MIGRATION_HISTORY_INCOMPLETE'))
  assert.ok(report.blockers.some((blocker) => blocker.code === 'ROLE_SMOKE_INCOMPLETE'))
})

test('permits only a controlled release candidate with complete cross-role evidence', () => {
  const report = buildTransferTaxPhase8ReleaseGate({
    phase7Report: approvedPhase7,
    appliedMigrations: TRANSFER_TAX_PHASE8_REQUIRED_MIGRATIONS,
    environment: 'production',
    smokeChecks: smokes,
    rollback,
  })
  assert.equal(report.status, 'READY_FOR_CONTROLLED_RELEASE')
  assert.equal(report.releaseReady, true)
})
