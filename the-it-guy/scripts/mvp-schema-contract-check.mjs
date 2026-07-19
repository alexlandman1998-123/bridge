import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const migrationPath = new URL('../../supabase/migrations/202607180046_mvp_atomic_transaction_creation_phase2a.sql', import.meta.url)
const migration = readFileSync(migrationPath, 'utf8')
const requiredContracts = [
  'bridge_create_mvp_transaction',
  'creation_idempotency_key',
  'bridge_seed_mvp_transaction_participants',
  'transaction_participant_requirements',
  'bridge_seed_mvp_transaction_documents',
  'transaction_required_documents',
  'bridge_seed_mvp_transaction_workflow_lanes',
  'transaction_workflow_lanes',
]

for (const contract of requiredContracts) {
  assert.ok(migration.includes(contract), `Missing MVP schema contract: ${contract}`)
}

console.log(JSON.stringify({
  version: 'arch9_mvp_schema_contract_check_v1',
  passed: true,
  migration: '202607180046_mvp_atomic_transaction_creation_phase2a.sql',
  contracts: requiredContracts,
}, null, 2))
