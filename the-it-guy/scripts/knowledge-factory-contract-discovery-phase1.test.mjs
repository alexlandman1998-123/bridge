import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const migration = await readFile(new URL('../../supabase/migrations/20260919193735_knowledge_factory_uat_contract_discovery_phase1.sql', import.meta.url), 'utf8')
const api = await readFile(new URL('../api/knowledge-factory/contract-discovery.js', import.meta.url), 'utf8')
const panel = await readFile(new URL('../src/components/canvassing/KnowledgeFactoryContractDiscoveryPanel.jsx', import.meta.url), 'utf8')
const operations = await readFile(new URL('../src/components/canvassing/KnowledgeFactoryOperationsWorkspace.jsx', import.meta.url), 'utf8')

assert.match(migration, /create table public\.knowledge_factory_uat_contract_checks/, 'Phase 1 must persist safe UAT contract checks.')
assert.match(migration, /fica_kyc_contract/, 'FICA\/KYC contract discovery must be separate from execution.')
assert.match(migration, /raw supplier data and personal data are prohibited/, 'The discovery store must prohibit raw supplier data.')
assert.match(migration, /enable row level security/, 'Contract discovery records must be protected by RLS.')
assert.match(migration, /knowledge_factory_uat_contract_check_events/, 'Contract checks must retain immutable event history.')
assert.match(api, /Only a principal-level administrator can manage UAT contract discovery/, 'Only principal-level administrators may manage discovery.')
assert.doesNotMatch(api, /KNOWLEDGE_FACTORY_PASSWORD|KNOWLEDGE_FACTORY_EMAIL|fetch\(/, 'Contract discovery must not call the supplier or require supplier credentials.')
assert.match(api, /\(count \|\| 0\) >= 8/, 'Discovery must stay a small controlled UAT set.')
assert.match(panel, /does not call the supplier or use credits/, 'The UI must make non-chargeable planning explicit.')
assert.match(panel, /Do not paste raw supplier responses, owner names, ID numbers, documents or tokens/, 'The UI must block sensitive evidence capture.')
assert.match(operations, /KnowledgeFactoryContractDiscoveryPanel/, 'Operations must expose Phase 1 discovery to administrators.')
console.log('knowledge factory Phase 1 contract-discovery checks passed')
