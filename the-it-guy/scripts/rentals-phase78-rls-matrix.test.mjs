import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { evaluateRentalRlsMatrix, RENTAL_RLS_MATRIX } from '../src/services/rentals/rentalRlsMatrix.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (path) => readFile(join(root, path), 'utf8')
const phase72 = await read('../supabase/migrations/20260831102932_rental_security_privacy_hardening.sql')
const phase73 = await read('../supabase/migrations/20260831102958_rental_recovery_runbooks.sql')
const phase74 = await read('../supabase/migrations/20260831103147_rental_controlled_rollout_cohorts.sql')

for (const migration of [phase72, phase73, phase74]) {
  assert.match(migration, /enable row level security/, 'Sensitive Phase 72–74 tables must enable RLS.')
  assert.match(migration, /revoke all on function public\.rental_/, 'Privileged Phase 72–74 RPCs must revoke public access.')
}
assert.ok(RENTAL_RLS_MATRIX.some((item) => item.key === 'tenant'))
assert.ok(RENTAL_RLS_MATRIX.some((item) => item.key === 'landlord'))

const protectedTables = [...new Set(RENTAL_RLS_MATRIX.flatMap((item) => item.tables))].map((name) => ({ name, rlsEnabled: true, policyCount: 1 }))
const passing = evaluateRentalRlsMatrix({ tables: protectedTables, functions: [{ name: 'rental_close_tenancy', anonExecute: false }, { name: 'rental_set_rollout_control', anonExecute: false }] })
assert.equal(passing.status, 'ready_for_pilot_review')
const blocked = evaluateRentalRlsMatrix({ tables: protectedTables.map((item) => item.name === 'rental_tenant_portal_access' ? { ...item, policyCount: 0 } : item), functions: [{ name: 'rental_close_tenancy', anonExecute: true }] })
assert.equal(blocked.status, 'not_ready')
assert.equal(blocked.blockers.length, 2)
console.log('Rentals Phase 78 RLS matrix checks passed.')
