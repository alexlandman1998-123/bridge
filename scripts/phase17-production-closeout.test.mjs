#!/usr/bin/env node
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const evidence = JSON.parse(readFileSync('deployment-evidence/2026-07-20-phase17/production-closeout.json', 'utf8'))
const calculatedReady = evidence.application.status === 'READY'
  && evidence.application.runtimeErrorLogs === 0
  && evidence.application.http500Logs === 0
  && evidence.database.accessVerification === 'pass'
  && evidence.database.migrationEvidenceComplete === evidence.database.migrationEvidenceTotal
  && evidence.database.incompleteMigrationCount === 0
  && evidence.releaseTraceability.workingTreeEntries === 0
  && evidence.releaseTraceability.commitsAheadOfRemote === 0
  && evidence.releaseTraceability.duplicateMigrationFileCount <= 1
  && evidence.runtimeRollout.productionCohortConfigured === true

assert.equal(calculatedReady, false)
assert.equal(evidence.status, 'PRODUCTION_CLOSEOUT_BLOCKED')
assert.equal(evidence.application.status, 'READY')
assert.equal(evidence.database.productionLedgerCount, evidence.database.expectedProductionLedgerCount)
assert.equal(evidence.database.incompleteMigrationCount, 28)
assert.equal(evidence.releaseTraceability.duplicateMigrationVersion, '202607200002')
assert.equal(evidence.releaseTraceability.deployedWorkingTreeHadUncommittedApplicationChanges, true)
assert.equal(evidence.phase0MigrationFreezeRemainsActive, true)
assert.equal(evidence.productionMutatedByCloseout, false)
assert.equal(evidence.blockers.length, 5)
console.log('Phase 17 production closeout tests passed: closeout remains fail-closed.')
