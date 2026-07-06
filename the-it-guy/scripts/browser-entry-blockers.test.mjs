import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const statusSharePath = path.join(root, 'src/pages/TransactionStatusShare.jsx')
const agentLeadsPath = path.join(root, 'src/pages/AgentLeadsPage.jsx')
const migrationPath = path.join(root, '../supabase/migrations/202605250013_browser_verification_entry_blockers.sql')

const statusShare = fs.readFileSync(statusSharePath, 'utf8')
const agentLeads = fs.readFileSync(agentLeadsPath, 'utf8')
assert.match(statusShare, /getClientStageExplainer/, 'TransactionStatusShare must import/use getClientStageExplainer')
assert.match(statusShare, /const\s+stageExplainer\s*=\s*getClientStageExplainer/, 'TransactionStatusShare must define stageExplainer before render')
assert.match(statusShare, /mainStage\s*\|\|\s*stage/, 'stage explainer should fall back from mainStage to detailed stage')

assert.match(agentLeads, /function\s+normalizeLeadCategory\(row\s*=\s*\{\}\)\s*\{\s*const\s+safeRow\s*=\s*row\s*&&\s*typeof\s+row\s*===\s*'object'\s*\?\s*row\s*:\s*\{\}/s, 'Agent leads category normalization must tolerate null lead rows')
assert.match(agentLeads, /const\s+category\s*=\s*normalizeLeadCategory\(lead\)[\s\S]*?<Modal\s+open=\{Boolean\(lead\)\}/, 'Closed delete lead modal must not crash when its lead prop is null')

const migration = fs.readFileSync(migrationPath, 'utf8')
assert.match(migration, /appt\.listing_id\s*=\s*v_listing\.id::text/, 'seller portal RPC must compare text listing_id to uuid listing id via text cast')
assert.match(migration, /appt\.lead_id::text\s*=\s*nullif\(v_listing\.seller_lead_id,\s*''\)/, 'seller portal RPC must compare lead ids with safe text cast')
assert.match(migration, /appt\.related_entity_id::text\s*=\s*v_listing\.id::text/, 'seller portal RPC must compare related entity ids through text-safe casts')
assert.match(migration, /bridge_create_staging_client_portal_fixture/, 'migration must add explicit staging client portal fixture helper')
assert.match(migration, /confirm_staging_browser_verification_fixture/, 'fixture helper must require explicit staging confirmation phrase')
assert.match(migration, /revoke all on function public\.bridge_create_staging_client_portal_fixture/, 'fixture helper must not be executable by public roles')

console.log('browser-entry-blockers tests passed')
