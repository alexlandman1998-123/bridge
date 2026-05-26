import assert from 'node:assert/strict'
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const sample = [
  {
    id: 'tx-1',
    bond_workspace_id: 'workspace-1',
    primary_bond_consultant_user_id: 'consultant-1',
    transaction_participants: [{ role: 'bond_originator', user_id: 'consultant-1', status: 'active' }],
  },
  {
    id: 'tx-2',
    assigned_bond_originator_email: 'legacy@example.test',
  },
  {
    id: 'tx-3',
    bond_originator: 'Legacy Text',
  },
]

const tempInput = path.join(os.tmpdir(), `bond-assignment-reconciliation-${Date.now()}.json`)
fs.writeFileSync(tempInput, JSON.stringify(sample, null, 2))

const output = execSync(
  `BOND_ASSIGNMENT_RECONCILIATION_INPUT=${tempInput} node scripts/report-bond-assignment-reconciliation.mjs`,
  { encoding: 'utf8', cwd: process.cwd() },
)

const match = output.match(/\{[\s\S]*\}\s*$/)
if (!match) {
  throw new Error('Failed to capture JSON report output from reconciliation script.')
}

const report = JSON.parse(match[0])
assert.equal(report.totalTransactions, 3)
assert.equal(report.canonicalAssignmentPresent, 1)
assert.equal(report.legacyEmailOnly, 1)
assert.equal(report.legacyTextOnly, 1)

console.log('bond assignment reconciliation test passed')
