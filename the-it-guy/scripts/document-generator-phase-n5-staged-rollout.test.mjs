import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const core = await readFile(new URL('../src/core/documents/documentExperienceRolloutControl.js', import.meta.url), 'utf8')
const service = await readFile(new URL('../src/services/documentExperienceRolloutService.js', import.meta.url), 'utf8')

for (const stage of ['pilot', 'expanded', 'full']) assert.match(core, new RegExp(`${stage}:`))
for (const decision of ['CONTINUE_STAGE', 'PROMOTE_TO_EXPANDED', 'PAUSE_ROLLOUT', 'EXTEND_OBSERVATION']) assert.match(core, new RegExp(decision))
for (const stop of ['N5_N4_REGRESSION_STOP', 'N5_COHORT_DRIFT_STOP', 'N5_INCIDENT_STOP', 'N5_CONTROL_EXPIRED']) assert.match(core, new RegExp(stop))
assert.match(service, /receiptDigest/)
assert.match(service, /document_experience_rollout/)
assert.doesNotMatch(service, /signerEmail|documentText|signingToken/)

console.log('Document generator N5 bounded staged rollout control passed.')
