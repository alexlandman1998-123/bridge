import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const migration = await readFile(new URL('../../supabase/migrations/20260914073037_knowledge_factory_commercial_policy_phase5.sql', import.meta.url), 'utf8')
const policyApi = await readFile(new URL('../api/knowledge-factory/commercial-policy.js', import.meta.url), 'utf8')
const reportsApi = await readFile(new URL('../api/knowledge-factory/reports.js', import.meta.url), 'utf8')
const panel = await readFile(new URL('../src/components/canvassing/KnowledgeFactoryCommercialPolicyPanel.jsx', import.meta.url), 'utf8')

assert.match(migration, /create table public\.knowledge_factory_commercial_policies/, 'Phase 5 must persist commercial policy.')
assert.match(migration, /rollout_stage text not null default 'uat'/, 'Commercial policy must stay in UAT by default.')
assert.match(migration, /production_approved_by/, 'Production policy must record an approver.')
assert.match(migration, /enable row level security/, 'Commercial policy must be RLS protected.')
assert.match(policyApi, /KNOWLEDGE_FACTORY_PRODUCTION_ENABLED/, 'Production policy must be gated by private server configuration.')
assert.match(policyApi, /Only a principal-level administrator/, 'Commercial policy changes must be administrator-only.')
assert.match(reportsApi, /assertCreditCaps/, 'Reports must enforce commercial credit caps server-side.')
assert.match(reportsApi, /assertReportTypesAllowed/, 'Reports must enforce package report scope server-side.')
assert.match(reportsApi, /monthly_credit_cap/, 'Reports must enforce the monthly cap before supplier commitment.')
assert.match(panel, /Credit caps are internal safety limits/, 'The UI must not present internal policy as a supplier price guarantee.')
assert.match(panel, /server gate locked/, 'The UI must make the production gate visible.')

console.log('knowledge factory Phase 5 commercial policy checks passed')
