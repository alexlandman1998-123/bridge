import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { buildAttorneyFirmFirstReadinessReport } from '../src/lib/attorneyFirmFirstReadiness.js'

const healthy = buildAttorneyFirmFirstReadinessReport([
  {
    transaction_id: 'tx-active',
    allocation_state: 'active',
    lifecycle_health: 'on_track',
  },
])
assert.equal(healthy.gate.status, 'pass')
assert.equal(healthy.gate.releaseRecommended, true)
assert.equal(healthy.summary.healthyCount, 1)
assert.equal(healthy.dryRun, true)

const warning = buildAttorneyFirmFirstReadinessReport([
  {
    transaction_id: 'tx-overdue',
    allocation_state: 'awaiting_firm_acceptance',
    lifecycle_health: 'attention',
    lifecycle_issue: 'firm_acceptance_sla_overdue',
    required_action: 'accept_or_decline_firm_nomination',
  },
])
assert.equal(warning.gate.status, 'warning')
assert.equal(warning.summary.overdueCount, 1)
assert.equal(warning.actions[0].key, 'accept_or_decline_firm_nomination')

const blocked = buildAttorneyFirmFirstReadinessReport([
  {
    transaction_id: 'tx-invalid',
    allocation_state: 'active',
    lifecycle_health: 'blocked',
    lifecycle_issue: 'active_matter_missing_firm_or_person_gate',
  },
  {
    transaction_id: 'tx-replacement',
    allocation_state: 'awaiting_firm_acceptance',
    lifecycle_health: 'on_track',
    replaces_assignment_id: 'assignment-declined',
  },
])
assert.equal(blocked.gate.status, 'blocked')
assert.equal(blocked.gate.releaseRecommended, false)
assert.deepEqual(blocked.blockingTransactions, ['tx-invalid'])
assert.equal(blocked.summary.replacementCount, 1)

const empty = buildAttorneyFirmFirstReadinessReport([])
assert.equal(empty.gate.status, 'warning')
assert.match(empty.gate.reason, /No firm-first transfer lifecycle rows/)

const [migration, auditScript, packageSource, runbook] = await Promise.all([
  readFile(new URL('../../supabase/migrations/202607170007_attorney_firm_first_release_readiness_phase8.sql', import.meta.url), 'utf8'),
  readFile(new URL('./audit-attorney-firm-first-readiness.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../package.json', import.meta.url), 'utf8'),
  readFile(new URL('../docs/attorney-firm-first-rollout-phase8.md', import.meta.url), 'utf8'),
])

assert.match(migration, /transfer_firm_allocation_release_readiness_v1/)
assert.match(migration, /transfer_firm_allocation_reconciliation_candidates_v1/)
assert.match(migration, /automatic_repair_allowed/)
assert.match(migration, /false as automatic_repair_allowed/)
assert.doesNotMatch(migration, /delete from|drop table|drop column/i)
assert.match(auditScript, /--strict/)
assert.match(auditScript, /transfer_firm_allocation_lifecycle_v2/)
assert.match(packageSource, /verify:attorney-firm-first-allocation:staging/)
assert.match(runbook, /Do not repair lifecycle rows directly/i)
assert.match(runbook, /Phase 8 gate must return `pass`/i)

console.log('Attorney firm-first allocation Phase 8 release readiness tests passed')
