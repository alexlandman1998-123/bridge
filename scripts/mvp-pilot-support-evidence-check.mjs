import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const options = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const [key, value] = arg.replace(/^--/, '').split('=')
  return [key, value || '']
}))
if (!options.evidence || !options['decision-evidence']) {
  throw new Error('Use --evidence=<pilot-support-evidence.json> --decision-evidence=<production-pilot-decision.json>.')
}

const evidence = JSON.parse(readFileSync(path.resolve(repoRoot, options.evidence), 'utf8'))
const decision = JSON.parse(readFileSync(path.resolve(repoRoot, options['decision-evidence']), 'utf8'))

assert.equal(evidence.environment, 'production', 'Pilot support evidence must be prepared for production.')
for (const field of ['preparedBy', 'preparedAt', 'supportOwner', 'pilotOwner', 'rollbackOwner', 'supportChannel', 'incidentLogReference', 'escalationRunbookReference', 'stopAuthority']) {
  assert.ok(String(evidence[field] || '').trim(), `Pilot support evidence requires ${field}.`)
}
assert.equal(evidence.supportOwner, decision.supportOwner, 'Support owner must match the approved pilot decision.')
assert.equal(evidence.pilotOwner, decision.pilotOwner, 'Pilot owner must match the approved pilot decision.')
assert.equal(evidence.rollbackOwner, decision.rollbackOwner, 'Rollback owner must match the approved pilot decision.')
assert.equal([evidence.pilotOwner, evidence.rollbackOwner].includes(evidence.stopAuthority), true, 'Stop authority must be the approved pilot or rollback owner.')
assert.equal(evidence.incidentRecordingEnabled, true, 'Pilot incident recording must be enabled.')
assert.equal(evidence.productionCredentialsUsed, false, 'Support-readiness evidence must not use production credentials.')
assert.equal(Number.isInteger(evidence.responseTargetMinutes), true, 'responseTargetMinutes must be an integer.')
assert.ok(evidence.responseTargetMinutes > 0 && evidence.responseTargetMinutes <= 60, 'responseTargetMinutes must be between 1 and 60.')
assert.equal(Number.isNaN(Date.parse(evidence.preparedAt)), false, 'preparedAt must be an ISO-compatible timestamp.')

console.log(JSON.stringify({
  version: 'arch9_mvp_pilot_support_evidence_v1',
  passed: true,
  pilotOwner: evidence.pilotOwner,
  supportOwner: evidence.supportOwner,
  rollbackOwner: evidence.rollbackOwner,
  stopAuthority: evidence.stopAuthority,
  responseTargetMinutes: evidence.responseTargetMinutes,
  safety: 'This validates support readiness only; it does not contact production or start a pilot.',
}, null, 2))
