import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (path) => readFile(join(root, path), 'utf8')
const migration = await read('../supabase/migrations/20260831110550_rental_financial_reconciliation_snapshot.sql')
const repository = await read('src/services/rentals/rentalFinancialReconciliationRepository.js')
const page = await read('src/pages/rentals/RentalFinancialReconciliationPage.jsx')
const app = await read('src/App.jsx')

for (const token of ['rental_get_financial_reconciliation', 'security definer', "set search_path = ''", 'rental_financial_manager_authorized', 'rental_financial_charges', 'rental_financial_payments', 'rental_financial_allocations', 'rental_payment_import_rows', 'rental_financial_correction_requests', 'Read-only operational reconciliation', 'revoke all on function']) assert.ok(migration.includes(token), `Missing reconciliation safeguard: ${token}`)
assert.ok(repository.includes("rpc('rental_get_financial_reconciliation'"), 'Reconciliation must use its read-only RPC.')
for (const token of ['cannot post, allocate, reverse, or correct money', 'Overallocation exceptions', 'Review queues']) assert.ok(page.includes(token), `Missing reconciliation UI guard: ${token}`)
assert.ok(app.includes('/agent/rentals/financial-reconciliation'), 'Financial reconciliation route is not registered.')
console.log('Rentals Phase 79 financial reconciliation checks passed.')
