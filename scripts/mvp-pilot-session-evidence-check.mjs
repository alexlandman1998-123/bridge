import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const options = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const [key, value] = arg.replace(/^--/, '').split('=')
  return [key, value || '']
}))
for (const name of ['evidence', 'decision-evidence', 'support-evidence']) {
  if (!options[name]) throw new Error(`Use --${name}=<path>.`)
}

const evidence = JSON.parse(readFileSync(path.resolve(repoRoot, options.evidence), 'utf8'))
const decision = JSON.parse(readFileSync(path.resolve(repoRoot, options['decision-evidence']), 'utf8'))
const support = JSON.parse(readFileSync(path.resolve(repoRoot, options['support-evidence']), 'utf8'))

assert.equal(evidence.environment, 'production', 'Pilot session evidence must be marked production.')
for (const field of ['sessionId', 'plannedAt', 'preparedBy', 'pilotOwner', 'supportOwner', 'rollbackOwner', 'stopAuthority']) {
  assert.ok(String(evidence[field] || '').trim(), `Pilot session evidence requires ${field}.`)
}
assert.equal(evidence.preparedBy, decision.pilotOwner, 'Pilot session must be prepared by the approved pilot owner.')
assert.equal(evidence.pilotOwner, decision.pilotOwner, 'Pilot owner must match the approved decision.')
assert.equal(evidence.supportOwner, decision.supportOwner, 'Support owner must match the approved decision.')
assert.equal(evidence.rollbackOwner, decision.rollbackOwner, 'Rollback owner must match the approved decision.')
assert.equal(evidence.stopAuthority, support.stopAuthority, 'Pilot session stop authority must match support readiness.')
assert.equal(evidence.sessionScope, 'single_batch_of_up_to_10', 'Pilot session scope must be one batch of up to ten.')
assert.equal(Number.isInteger(evidence.batchNumber), true, 'batchNumber must be an integer.')
assert.ok(evidence.batchNumber > 0, 'batchNumber must be positive.')
assert.equal(Array.isArray(evidence.plannedTransactionReferences), true, 'plannedTransactionReferences is required.')
assert.ok(evidence.plannedTransactionReferences.length > 0, 'At least one planned transaction reference is required.')
assert.ok(evidence.plannedTransactionReferences.length <= decision.initialBatchSize, 'Pilot session may not plan more than the approved batch size.')
const references = evidence.plannedTransactionReferences.map((value) => String(value).trim())
assert.equal(references.every(Boolean), true, 'Each planned transaction reference is required.')
assert.equal(new Set(references).size, references.length, 'Planned transaction references must be unique.')
assert.equal(evidence.productionCredentialsUsed, false, 'Pilot session evidence must not use production credentials.')
assert.equal(Number.isNaN(Date.parse(evidence.plannedAt)), false, 'plannedAt must be an ISO-compatible timestamp.')

console.log(JSON.stringify({
  version: 'arch9_mvp_pilot_session_evidence_v1',
  passed: true,
  sessionId: evidence.sessionId,
  batchNumber: evidence.batchNumber,
  plannedTransactionCount: references.length,
  batchLimit: decision.initialBatchSize,
  stopAuthority: evidence.stopAuthority,
  safety: 'This validates a declared pilot session only; it does not create production transactions.',
}, null, 2))
