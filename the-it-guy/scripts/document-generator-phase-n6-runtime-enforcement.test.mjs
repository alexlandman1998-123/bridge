import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const core = await readFile(new URL('../src/core/documents/documentExperienceRuntimeRolloutGate.js', import.meta.url), 'utf8')
const service = await readFile(new URL('../src/services/documentExperienceRuntimeRolloutService.js', import.meta.url), 'utf8')
const page = await readFile(new URL('../src/pages/LegalDocumentWorkspacePage.jsx', import.meta.url), 'utf8')
const migration = await readFile(new URL('../../supabase/migrations/202607180043_document_experience_runtime_enforcement_n6.sql', import.meta.url), 'utf8')

for (const code of ['N6_RUNTIME_STORE_UNAVAILABLE', 'N6_CONTROL_NOT_CONFIGURED', 'N6_PAUSED', 'N6_ENROLLED']) assert.match(core, new RegExp(code))
assert.match(service, /bridge_document_experience_runtime_access_n6/)
assert.match(page, /fetchDocumentExperienceRuntimeRolloutAccess/)
assert.match(page, /runtimeRolloutAccess\.decision\?\.allowed/)
assert.match(page, /N6_SHADOW_RUNTIME_CHECK_FAILED/)
assert.doesNotMatch(page, /Document rollout unavailable/)
for (const token of ['document_experience_rollout_controls_n6', 'document_experience_rollout_enrolments_n6', 'document_experience_rollout_audit_n6', 'bridge_set_document_experience_rollout_n6', 'bridge_document_experience_runtime_access_n6', 'bridge_is_active_member']) assert.match(migration, new RegExp(token))

console.log('Document generator N6 persisted runtime rollout enforcement passed.')
