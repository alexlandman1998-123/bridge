import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const migration = await readFile(new URL('../supabase/migrations/20260909200653_knowledge_factory_phase4_fica_kyc_cases.sql', import.meta.url), 'utf8')
const workspace = await readFile(new URL('../the-it-guy/src/components/canvassing/KnowledgeFactoryFicaWorkspace.jsx', import.meta.url), 'utf8')
const page = await readFile(new URL('../the-it-guy/src/pages/PipelineCanvassingPage.jsx', import.meta.url), 'utf8')

assert.match(migration, /knowledge_factory_fica_cases/)
assert.match(migration, /enable row level security/i)
assert.match(migration, /Identity numbers, document files, credit data and third-party KYC responses/i)
assert.match(workspace, /Consent-first FICA\/KYC workspace/)
assert.match(workspace, /verification submission remains disabled/i)
assert.match(workspace, /Document data was entered manually|Do not enter ID numbers/i)
assert.match(page, /KnowledgeFactoryFicaWorkspace/)

console.log('Knowledge Factory Phase 4 FICA/KYC checks passed.')
