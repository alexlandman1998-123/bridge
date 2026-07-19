import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { auditMvpPilotBatch } from '../the-it-guy/src/core/transactions/mvpPilotBatchAudit.js'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const inputArg = process.argv.find((arg) => arg.startsWith('--input='))
const sessionArg = process.argv.find((arg) => arg.startsWith('--session-evidence='))
if (!inputArg || !sessionArg) throw new Error('Use --input=<production-batch-evidence.json> --session-evidence=<approved-pilot-session.json>.')

const input = JSON.parse(readFileSync(path.resolve(repoRoot, inputArg.slice('--input='.length)), 'utf8'))
const session = JSON.parse(readFileSync(path.resolve(repoRoot, sessionArg.slice('--session-evidence='.length)), 'utf8'))
if (input.environment !== 'production') throw new Error('Pilot batch evidence must be marked as production.')
if (input.sessionCheckPassed !== true) throw new Error('A passing pilot session check is required before auditing a production batch.')
if (input.sessionId !== session.sessionId) throw new Error('Pilot batch sessionId must match the approved pilot session.')
if (input.batchNumber !== session.batchNumber) throw new Error('Pilot batch batchNumber must match the approved pilot session.')

const base = auditMvpPilotBatch(input.transactions || [], { batchLimit: 10 })
const issues = [...base.issues]
const plannedReferences = (session.plannedTransactionReferences || []).map((value) => String(value).trim())
const actualReferences = []
for (const transaction of input.transactions || []) {
  const id = transaction.transactionId || transaction.id || 'unknown'
  const reference = String(transaction.plannedTransactionReference || '').trim()
  if (!reference) issues.push(`planned_reference_missing:${id}`)
  else actualReferences.push(reference)
  if (transaction.postDeploySmokePassed !== true) issues.push(`postdeploy_smoke_failed:${id}`)
  if (transaction.gateStateConsistent !== true) issues.push(`gate_state_inconsistent:${id}`)
}
if (new Set(actualReferences).size !== actualReferences.length) issues.push('planned_reference_duplicated')
if (plannedReferences.length !== actualReferences.length || plannedReferences.some((reference) => !actualReferences.includes(reference)) || actualReferences.some((reference) => !plannedReferences.includes(reference))) {
  issues.push('batch_does_not_match_declared_session')
}
const report = {
  ...base,
  passed: issues.length === 0,
  issues,
  sessionId: session.sessionId,
  batchNumber: session.batchNumber,
  plannedTransactionCount: plannedReferences.length,
}
console.log(JSON.stringify(report, null, 2))
if (!report.passed) process.exit(1)
