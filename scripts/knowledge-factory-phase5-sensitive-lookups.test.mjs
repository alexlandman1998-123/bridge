import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const migration = await readFile(new URL('../supabase/migrations/20260909200857_knowledge_factory_phase5_sensitive_lookup_cases.sql', import.meta.url), 'utf8')
const workspace = await readFile(new URL('../the-it-guy/src/components/canvassing/KnowledgeFactorySensitiveLookupWorkspace.jsx', import.meta.url), 'utf8')
const page = await readFile(new URL('../the-it-guy/src/pages/PipelineCanvassingPage.jsx', import.meta.url), 'utf8')

assert.match(migration, /knowledge_factory_sensitive_lookup_cases/)
assert.match(migration, /enable row level security/i)
assert.match(migration, /must never hold identity numbers, raw credit/i)
assert.match(workspace, /Sensitive lookup control/)
assert.match(workspace, /Provider is not configured/)
assert.match(workspace, /explicit consent and lawful authority/i)
assert.match(page, /KnowledgeFactorySensitiveLookupWorkspace/)

console.log('Knowledge Factory Phase 5 sensitive lookup checks passed.')
