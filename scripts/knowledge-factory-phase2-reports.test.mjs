import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const migration = await readFile(new URL('../supabase/migrations/20260909195429_knowledge_factory_phase2_reports.sql', import.meta.url), 'utf8')
const edgeFunction = await readFile(new URL('../supabase/functions/knowledge-factory-graphql/index.ts', import.meta.url), 'utf8')
const reportsUi = await readFile(new URL('../the-it-guy/src/components/canvassing/KnowledgeFactoryReportsWorkspace.jsx', import.meta.url), 'utf8')
const mapUi = await readFile(new URL('../the-it-guy/src/components/canvassing/KnowledgeFactoryParcelMap.jsx', import.meta.url), 'utf8')

assert.match(migration, /create table public\.knowledge_factory_report_requests/i)
assert.match(migration, /enable row level security/i)
assert.match(migration, /Supplier payloads, owners, buyers, sellers, bonds,[\s\S]*credit data are never persisted/i)
assert.match(edgeFunction, /quote_property_report/)
assert.match(edgeFunction, /request_property_report/)
assert.match(edgeFunction, /GraphQL-Cost": costMode/)
assert.match(edgeFunction, /property_report/)
assert.match(reportsUi, /Supplier credit estimate/)
assert.match(reportsUi, /Request live property report/)
assert.match(mapUi, /Prepare report/)

console.log('Knowledge Factory Phase 2 report checks passed.')
