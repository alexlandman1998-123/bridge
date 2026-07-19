import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const options = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const [key, value] = arg.replace(/^--/, '').split('=')
  return [key, value || '']
}))
for (const name of ['evidence', 'batch-audit', 'session-evidence', 'support-evidence']) {
  if (!options[name]) throw new Error(`Use --${name}=<path>.`)
}

const evidence = JSON.parse(readFileSync(path.resolve(repoRoot, options.evidence), 'utf8'))
const audit = JSON.parse(readFileSync(path.resolve(repoRoot, options['batch-audit']), 'utf8'))
const session = JSON.parse(readFileSync(path.resolve(repoRoot, options['session-evidence']), 'utf8'))
const support = JSON.parse(readFileSync(path.resolve(repoRoot, options['support-evidence']), 'utf8'))

assert.equal(evidence.environment, 'production', 'Batch closeout evidence must be marked production.')
for (const field of ['sessionId', 'batchNumber', 'closedBy', 'closedAt', 'supportAcknowledgedBy', 'supportAcknowledgedAt']) {
  assert.ok(String(evidence[field] || '').trim(), `Batch closeout evidence requires ${field}.`)
}
assert.equal(evidence.sessionId, session.sessionId, 'Batch closeout sessionId must match the pilot session.')
assert.equal(evidence.batchNumber, session.batchNumber, 'Batch closeout batchNumber must match the pilot session.')
assert.equal(evidence.closedBy, session.pilotOwner, 'Batch closeout must be completed by the approved pilot owner.')
assert.equal(evidence.supportAcknowledgedBy, support.supportOwner, 'Batch closeout must be acknowledged by the approved support owner.')
assert.equal(audit.passed, true, 'The referenced batch audit must pass.')
assert.equal(audit.sessionId, session.sessionId, 'Batch audit must reference the same pilot session.')
assert.equal(audit.batchNumber, session.batchNumber, 'Batch audit must reference the same batch number.')
assert.equal(audit.batchSize, session.plannedTransactionReferences?.length, 'Batch audit size must match the declared session.')
assert.deepEqual(audit.issues || [], [], 'Batch audit issues must be empty before closeout.')
assert.equal(Number.isInteger(evidence.incidentCount), true, 'incidentCount must be an integer.')
assert.ok(evidence.incidentCount >= 0, 'incidentCount must not be negative.')
assert.equal(evidence.stopConditionsTriggered, false, 'A stop condition prevents a batch from closing for continuation.')
assert.equal(evidence.productionCredentialsUsed, false, 'Batch closeout evidence must not use production credentials.')
assert.equal(Number.isNaN(Date.parse(evidence.closedAt)), false, 'closedAt must be an ISO-compatible timestamp.')
assert.equal(Number.isNaN(Date.parse(evidence.supportAcknowledgedAt)), false, 'supportAcknowledgedAt must be an ISO-compatible timestamp.')

const readyForNextSession = evidence.incidentCount === 0 && evidence.closeoutDecision === 'allow_next_session_check'
assert.equal(readyForNextSession, true, 'Only an incident-free batch may allow a new session check.')

console.log(JSON.stringify({
  version: 'arch9_mvp_pilot_batch_closeout_v1',
  passed: true,
  decision: 'ready_for_next_session_check',
  sessionId: evidence.sessionId,
  batchNumber: evidence.batchNumber,
  batchSize: audit.batchSize,
  closedBy: evidence.closedBy,
  supportAcknowledgedBy: evidence.supportAcknowledgedBy,
  safety: 'This validates a completed pilot batch; it does not authorise a new session or create transactions.',
}, null, 2))
