import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const migration = await readFile(new URL('../../supabase/migrations/20260919194808_knowledge_factory_report_recipe_contract_gate_phase2.sql', import.meta.url), 'utf8')
const api = await readFile(new URL('../api/knowledge-factory/report-products.js', import.meta.url), 'utf8')
const panel = await readFile(new URL('../src/components/canvassing/KnowledgeFactoryReportProductsPanel.jsx', import.meta.url), 'utf8')

assert.match(migration, /required_contract_operations text\[\] not null/, 'Report packages must persist their UAT operation dependencies.')
assert.match(migration, /when 'basic_owner_lookup' then array\['property_by_id', 'owners'\]/, 'Basic must require property and owner contract evidence.')
assert.match(migration, /when 'full_canvassing_report' then array\['property_by_id', 'owners', 'municipal_valuation', 'transfers', 'bonds'\]/, 'Full must require all of its supplier operation evidence.')
assert.match(migration, /status = 'draft'/, 'Existing packages must return to draft when this new UAT gate is added.')
assert.match(api, /requiredContractOperations: \["property_by_id", "owners"\]/, 'The server must own Basic recipe dependencies.')
assert.match(api, /missingContractOperations/, 'The server must surface unmet contract dependencies.')
assert.match(api, /Pass the required UAT contract checks first/, 'An unproven recipe cannot become UAT-ready.')
assert.match(panel, /UAT contract dependencies/, 'The package UI must show recipe evidence before release.')
console.log('knowledge factory Phase 2 report-recipe contract-gate checks passed')
