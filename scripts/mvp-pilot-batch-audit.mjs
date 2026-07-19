import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { auditMvpPilotBatch } from '../the-it-guy/src/core/transactions/mvpPilotBatchAudit.js'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const inputArg = process.argv.find((arg) => arg.startsWith('--input='))
if (!inputArg) throw new Error('Use --input=<production-batch-evidence.json>.')

const input = JSON.parse(readFileSync(path.resolve(repoRoot, inputArg.slice('--input='.length)), 'utf8'))
if (input.environment !== 'production') throw new Error('Pilot batch evidence must be marked as production.')
if (input.sessionCheckPassed !== true) throw new Error('A passing pilot session check is required before auditing a production batch.')

const base = auditMvpPilotBatch(input.transactions || [], { batchLimit: 10 })
const issues = [...base.issues]
for (const transaction of input.transactions || []) {
  const id = transaction.transactionId || transaction.id || 'unknown'
  if (transaction.postDeploySmokePassed !== true) issues.push(`postdeploy_smoke_failed:${id}`)
  if (transaction.gateStateConsistent !== true) issues.push(`gate_state_inconsistent:${id}`)
}
const report = { ...base, passed: issues.length === 0, issues }
console.log(JSON.stringify(report, null, 2))
if (!report.passed) process.exit(1)
