import assert from 'node:assert/strict'
import fs from 'node:fs/promises'

const source = await fs.readFile(new URL('../api/knowledge-factory/sensitive-lookups.js', import.meta.url), 'utf8')
const client = await fs.readFile(new URL('../src/services/propertyIntelligence/knowledgeFactorySensitiveLookupService.js', import.meta.url), 'utf8')
const workspace = await fs.readFile(new URL('../src/components/canvassing/KnowledgeFactorySensitiveLookupWorkspace.jsx', import.meta.url), 'utf8')
const fica = await fs.readFile(new URL('../src/components/canvassing/KnowledgeFactoryFicaWorkspace.jsx', import.meta.url), 'utf8')
const migration = await fs.readFile(new URL('../../supabase/migrations/20260914073809_knowledge_factory_sensitive_case_controls_phase6.sql', import.meta.url), 'utf8')

assert.match(source, /providerExecutionEnabled: false/, 'sensitive workflow must declare provider execution disabled')
assert.doesNotMatch(source, /KNOWLEDGE_FACTORY_(EMAIL|PASSWORD|GRAPHQL)/, 'sensitive workflow must not use supplier credentials')
assert.doesNotMatch(source, /\bfetch\s*\(/, 'sensitive workflow must not call a supplier')
assert.match(source, /consentVersion/, 'server must require a versioned consent record')
assert.match(source, /Only an organisation administrator can review/, 'server must protect approval decisions')
assert.match(client, /\/api\/knowledge-factory\/sensitive-lookups/, 'browser writes must use the protected server route')
assert.doesNotMatch(client, /\.from\('knowledge_factory_sensitive_lookup_cases'\)\.insert/, 'browser must not insert sensitive cases directly')
assert.match(workspace, /Provider is not configured/, 'UI must not imply provider execution is live')
assert.match(workspace, /Approve for quote/, 'administrators need a review action')
assert.match(fica, /not configured/i, 'FICA workspace must remain explicit that provider verification is disabled')
assert.match(migration, /revoke insert, update, delete on public\.knowledge_factory_sensitive_lookup_cases from authenticated/, 'migration must remove direct browser writes')
assert.match(migration, /knowledge_factory_sensitive_lookup_events/, 'migration must add immutable audit events')
assert.match(migration, /Never store identity numbers, provider payloads, credit results or deeds-party data/, 'migration must document the data boundary')

console.log('Knowledge Factory Phase 6 sensitive controls checks passed.')
