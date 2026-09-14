import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const migration = await readFile(new URL('../../supabase/migrations/20260914072215_knowledge_factory_controlled_uat_cases_phase4.sql', import.meta.url), 'utf8')
const api = await readFile(new URL('../api/knowledge-factory/uat.js', import.meta.url), 'utf8')
const panel = await readFile(new URL('../src/components/canvassing/KnowledgeFactoryUatCasesPanel.jsx', import.meta.url), 'utf8')
const operations = await readFile(new URL('../src/components/canvassing/KnowledgeFactoryOperationsWorkspace.jsx', import.meta.url), 'utf8')

assert.match(migration, /create table public\.knowledge_factory_uat_cases/, 'Phase 4 must persist controlled UAT cases.')
assert.match(migration, /check \(property_id > 0\)/, 'UAT cases must require a valid non-sensitive property identifier.')
assert.match(migration, /knowledge_factory_uat_case_events/, 'Phase 4 must retain an immutable UAT case event history.')
assert.match(migration, /enable row level security/, 'UAT tables must enable RLS.')
assert.match(migration, /revoke all on public\.knowledge_factory_uat_cases/, 'UAT case writes must not be directly exposed to the browser.')
assert.match(api, /Only a principal-level administrator can manage the controlled UAT set/, 'The UAT API must require a principal-level administrator.')
assert.match(api, /\(count \|\| 0\) >= 5/, 'The UAT API must cap the active controlled set at five cases.')
assert.doesNotMatch(api, /fetch\(/, 'The UAT API should remain separate from supplier calls.')
assert.doesNotMatch(api, /KNOWLEDGE_FACTORY_PASSWORD|KNOWLEDGE_FACTORY_EMAIL/, 'The UAT register must not require or expose supplier credentials.')
assert.match(api, /The linked report must belong to this organisation/, 'A linked report must be scoped to the UAT organisation.')
assert.match(panel, /Small controlled UAT set/, 'Operations must offer a focused UAT case register.')
assert.match(panel, /Creating a case does not contact the supplier or use credits/, 'UAT planning must be explicitly non-chargeable.')
assert.match(panel, /activeCount >= state\.limit/, 'The UAT panel must prevent broad test-set expansion.')
assert.match(operations, /KnowledgeFactoryUatCasesPanel/, 'The UAT register must be available from the admin Operations workspace.')

console.log('knowledge factory Phase 4 UAT checks passed')
