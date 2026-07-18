import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const core = await readFile(new URL('../src/core/documents/documentExperienceLaunchGate.js', import.meta.url), 'utf8')
const service = await readFile(new URL('../src/services/documentExperienceLaunchHealthService.js', import.meta.url), 'utf8')

assert.match(core, /READY_FOR_CONTROLLED_ROLLOUT/)
assert.match(core, /HOLD_AND_FIX/)
for (const blocker of ['N4_TELEMETRY_UNAVAILABLE', 'N4_PRIVACY_BOUNDARY_FAILED', 'N4_DOCUMENT_COVERAGE_MISSING', 'N4_RECOVERY_RATE_HIGH', 'N4_CONFIRMATION_ABANDONMENT_HIGH', 'N4_OUTCOME_RATE_LOW']) assert.match(core, new RegExp(blocker))
assert.match(core, /solution: solution/)
assert.match(service, /event_name, severity, created_at, metadata/)
assert.match(service, /evaluateDocumentExperienceLaunchHealth/)
assert.match(service, /browserEvents/)
assert.doesNotMatch(service, /select\([^\n]*(user_id|workspace_id|route|\bid\b)/)

console.log('Document generator N4 launch health and phased blocker gate passed.')
