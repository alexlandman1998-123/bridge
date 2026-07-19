import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const options = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const [key, value] = arg.replace(/^--/, '').split('=')
  return [key, value || '']
}))
for (const name of ['prior-closeout-evidence', 'next-session-evidence']) {
  if (!options[name]) throw new Error(`Use --${name}=<path>.`)
}

const closeout = JSON.parse(readFileSync(path.resolve(repoRoot, options['prior-closeout-evidence']), 'utf8'))
const nextSession = JSON.parse(readFileSync(path.resolve(repoRoot, options['next-session-evidence']), 'utf8'))

assert.equal(closeout.environment, 'production', 'Prior closeout must be production evidence.')
assert.equal(nextSession.environment, 'production', 'Next session must be production evidence.')
assert.equal(closeout.closeoutDecision, 'allow_next_session_check', 'Prior batch closeout must explicitly allow a new session check.')
assert.equal(closeout.incidentCount, 0, 'Prior batch must have no incidents before continuation.')
assert.equal(closeout.stopConditionsTriggered, false, 'Prior batch must have no stop condition before continuation.')
assert.equal(nextSession.batchNumber, Number(closeout.batchNumber) + 1, 'Next session must immediately follow the closed batch.')
assert.ok(String(closeout.sessionId || '').trim(), 'Prior closeout sessionId is required.')
assert.ok(String(nextSession.sessionId || '').trim(), 'Next session sessionId is required.')
assert.notEqual(nextSession.sessionId, closeout.sessionId, 'Each pilot batch requires a new session id.')
const closedAt = Date.parse(String(closeout.closedAt || ''))
const plannedAt = Date.parse(String(nextSession.plannedAt || ''))
assert.equal(Number.isNaN(closedAt), false, 'Prior closeout closedAt must be an ISO-compatible timestamp.')
assert.equal(Number.isNaN(plannedAt), false, 'Next session plannedAt must be an ISO-compatible timestamp.')
assert.ok(closedAt <= plannedAt, 'Next session must be planned after the prior closeout.')

console.log(JSON.stringify({
  version: 'arch9_mvp_pilot_continuation_evidence_v1',
  passed: true,
  priorSessionId: closeout.sessionId,
  nextSessionId: nextSession.sessionId,
  nextBatchNumber: nextSession.batchNumber,
  decision: 'prior_batch_allows_new_session_check',
  safety: 'This validates continuation evidence only; the next batch still requires a fresh Phase 7 session check.',
}, null, 2))
